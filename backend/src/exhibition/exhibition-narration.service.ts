import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
import { StorageService } from '../storage';
import { ExternalApiService } from '../external-api';
import { AuditService } from '../audit';
import { exhibitionAssetUrl } from './exhibition.types';
import { synthesizeWithIndexTts2 } from './indextts2-client';
import { synthesizeWithVoxcpm } from './voxcpm-client';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/**
 * TTS 播报风格控制指令默认值(未在「AI 接入管理」为 TTS 平台单独配置时用此)。
 * VoxCPM 直接吃 control_instruction;云 OpenAI 兼容 TTS 走 instructions(支持的模型如 gpt-4o-mini-tts);
 * IndexTTS2 作情感描述文本。国企展厅专职讲解员:慢速、分层停顿、顿挫、重读、不赶语速。
 * ⚠ 若改此文案,前端 ExternalApis.tsx 的 DEFAULT_TTS_CONTROL_INSTRUCTION 同步。
 */
export const DEFAULT_TTS_CONTROL_INSTRUCTION =
  '国企展厅专职讲解员,面向参观者娓娓道来。整体放慢语速、沉稳舒缓:短语之间短促停顿,长句在自然换气处停顿,段落结尾留长停顿;核心关键词重读突出,朗读富于起伏顿挫、层次分明,每处分层都留出思考的间隙,咬字放慢、气息松弛。切忌语速过快、机械匀速、一口气念完长句或赶稿式速读——宁可慢一点、稳一点,也不要平铺直叙、通篇赶语速。';

export interface NarrationTtsResult {
  /** 生成音频存入 storage 后的 fileId(写进 fixture.narration.audioFileId) */
  fileId: string;
  /** 公开可访问的相对 URL(前端按推断 base 拼) */
  url: string;
  provider: string;
  model: string;
}

/** 按返回 content-type / 字节魔数判音频格式(落盘用对扩展名 + mime) */
function sniffAudio(ct: string, buf: Buffer): { ext: string; mime: string } {
  const t = ct.toLowerCase();
  if (t.includes('wav') || (buf.length > 4 && buf.toString('ascii', 0, 4) === 'RIFF'))
    return { ext: 'wav', mime: 'audio/wav' };
  if (t.includes('ogg') || (buf.length > 4 && buf.toString('ascii', 0, 4) === 'OggS'))
    return { ext: 'ogg', mime: 'audio/ogg' };
  return { ext: 'mp3', mime: 'audio/mpeg' };
}

/**
 * 在线解说员「党建小益」配音 —— 把展品解说词文本经 TTS 合成成音频,存 storage 返回 fileId。
 *
 * provider/model 走 external-api 的 `exhibition.narration.tts` 消费点(需配 tts 能力 + ttsModel)。
 * 调用 OpenAI 兼容的语音合成端点 `${apiUrl}/audio/speech`({ model, input, voice, response_format }),
 * 多数云平台(火山方舟等)兼容此口;返回原始音频字节(也兼容个别返回 JSON+base64/url 的实现)。
 * 结果落业务文件夹 `narration/{hallId}`(挂载群晖后 File Station 里按厅可浏览)。
 */
@Injectable()
export class ExhibitionNarrationService {
  private readonly logger = new Logger(ExhibitionNarrationService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly externalApi: ExternalApiService,
    private readonly audit: AuditService,
  ) {}

  async synthesize(
    opts: { text: string; voice?: string; hallId?: string; voiceRefFileId?: string },
    actor: AuditCtx,
  ): Promise<NarrationTtsResult> {
    const text = (opts.text ?? '').trim();
    if (!text) throw new BadRequestException('缺少解说词文本');
    if (text.length > 2000) throw new BadRequestException('解说词过长(请控制在 2000 字以内)');

    // 1. 解析 TTS provider(按优先级 / 路由绑定)
    const cfg = await this.externalApi.getConfigForConsumer('exhibition.narration.tts');
    if (!cfg) {
      throw new BadRequestException(
        '未找到可用的「语音合成」模型。请到「AI 接入管理」给某个平台(如豆包/火山)勾选 tts 能力 + 填写 ttsModel(语音合成模型)+ ttsVoice(音色),并配好 Key。',
      );
    }
    if (!cfg.model) {
      throw new BadRequestException(
        `平台「${cfg.provider}」已标 tts 能力但未填 ttsModel(语音合成模型)。请在「AI 接入管理」补上。`,
      );
    }
    if (!cfg.apiUrl) {
      throw new BadRequestException(`平台「${cfg.provider}」未配置 endpoint(apiUrl)`);
    }
    const apiUrl = cfg.apiUrl.replace(/\/+$/, '');
    // 播报风格控制指令:平台单独配了用平台的,否则用内置默认(慢速/分层停顿/顿挫/不赶语速)
    const control = (cfg.controlInstruction ?? '').trim() || DEFAULT_TTS_CONTROL_INSTRUCTION;
    const started = Date.now();
    let outBuf: Buffer;
    let ext: string;
    let mime: string;

    if (cfg.model === 'indextts2') {
      // 2a. 本地 IndexTTS2(Gradio 声音克隆):有解说员音色参考音频则克隆该音色,否则用自带示例音色
      try {
        let ref: { buffer: Buffer; name: string } | undefined;
        if (opts.voiceRefFileId) {
          const f = await this.storage.getBuffer(opts.voiceRefFileId);
          ref = { buffer: f.buffer, name: f.meta.originalName };
        }
        const r = await synthesizeWithIndexTts2(apiUrl, text, ref, control);
        outBuf = r.buffer;
        ext = r.ext;
        mime = r.mime;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        this.logger.warn(`IndexTTS2 配音失败 base=${apiUrl}: ${msg}`);
        await this.audit.log({
          action: 'exhibition.narration.tts',
          ...actor,
          detail: JSON.stringify({ ok: false, provider: cfg.provider, model: cfg.model, msg }),
        });
        throw new BadRequestException(`IndexTTS2 生成语音失败:${msg}`);
      }
    } else if (cfg.model === 'voxcpm') {
      // 2a'. 本地 VoxCPM(Gradio):有解说员音色参考音频则克隆该音色,否则用默认音色
      try {
        let ref: { buffer: Buffer; name: string } | undefined;
        if (opts.voiceRefFileId) {
          const f = await this.storage.getBuffer(opts.voiceRefFileId);
          ref = { buffer: f.buffer, name: f.meta.originalName };
        }
        const r = await synthesizeWithVoxcpm(apiUrl, text, ref, control);
        outBuf = r.buffer;
        ext = r.ext;
        mime = r.mime;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        this.logger.warn(`VoxCPM 配音失败 base=${apiUrl}: ${msg}`);
        await this.audit.log({
          action: 'exhibition.narration.tts',
          ...actor,
          detail: JSON.stringify({ ok: false, provider: cfg.provider, model: cfg.model, msg }),
        });
        throw new BadRequestException(`VoxCPM 生成语音失败:${msg}`);
      }
    } else {
      // 2b. OpenAI 兼容云 TTS(/audio/speech)
      const voice = (opts.voice && opts.voice.trim()) || cfg.voice || undefined;
      let resp: { data: ArrayBuffer; headers: Record<string, unknown> };
      try {
        resp = await axios.post(
          `${apiUrl}/audio/speech`,
          // instructions:OpenAI 兼容 TTS 的播报风格指令(gpt-4o-mini-tts 等支持;不支持的模型忽略未知字段)
          { model: cfg.model, input: text, ...(voice ? { voice } : {}), ...(control ? { instructions: control } : {}), response_format: 'mp3' },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
            },
            responseType: 'arraybuffer',
            timeout: 60_000,
          },
        );
      } catch (e) {
        const err = e as AxiosError;
        let msg = err.message ?? '未知错误';
        const body = err.response?.data;
        if (body) {
          try {
            const txt = Buffer.from(body as ArrayBuffer).toString('utf8');
            const parsed = JSON.parse(txt) as { error?: { message?: string }; message?: string };
            msg = parsed.error?.message ?? parsed.message ?? txt.slice(0, 200);
          } catch {
            /* 非 JSON,保留 err.message */
          }
        }
        this.logger.warn(`解说配音失败 provider=${cfg.provider} model=${cfg.model}: ${msg}`);
        await this.audit.log({
          action: 'exhibition.narration.tts',
          ...actor,
          detail: JSON.stringify({ ok: false, provider: cfg.provider, model: cfg.model, msg }),
        });
        throw new BadRequestException(`AI 生成语音失败:${msg}`);
      }

      const ct = String(resp.headers['content-type'] ?? '');
      let buf = Buffer.from(resp.data);
      if (ct.includes('json')) {
        // 2xx 但 content-type=json:可能截断/被网关注入页/远端 url 失效 —— 包 try 防裸 500
        try {
          const json = JSON.parse(buf.toString('utf8')) as {
            data?: string;
            audio?: string;
            audio_base64?: string;
            url?: string;
          };
          const b64 = json.data ?? json.audio ?? json.audio_base64;
          if (b64) {
            buf = Buffer.from(b64, 'base64');
          } else if (json.url) {
            const dl = await axios.get<ArrayBuffer>(json.url, { responseType: 'arraybuffer', timeout: 60_000 });
            buf = Buffer.from(dl.data);
          } else {
            throw new BadRequestException('AI 返回为空(既无音频字节也无 base64/url)');
          }
        } catch (e) {
          if (e instanceof BadRequestException) throw e;
          const msg = e instanceof Error ? e.message : '未知错误';
          this.logger.warn(`解说配音解析失败 provider=${cfg.provider} model=${cfg.model}: ${msg}`);
          await this.audit.log({
            action: 'exhibition.narration.tts',
            ...actor,
            detail: JSON.stringify({ ok: false, provider: cfg.provider, model: cfg.model, msg: `解析失败:${msg}` }),
          });
          throw new BadRequestException(`AI 返回的音频无法解析:${msg}`);
        }
      }
      if (!buf.length) throw new BadRequestException('AI 返回的音频为空');
      outBuf = buf;
      ({ ext, mime } = sniffAudio(ct, buf));
    }

    // 4. 存 storage(业务文件夹 narration/{hallId};public 可见,经公开素材口流式)
    const stored = await this.storage.put(
      {
        buffer: outBuf,
        originalName: `解说-${Date.now()}.${ext}`,
        mimeType: mime,
        ownerModule: 'exhibition',
        folder: opts.hallId ? `narration/${opts.hallId}` : 'narration',
        visibility: 'public',
        createdById: actor.actorId,
      },
      actor,
    );

    await this.audit.log({
      action: 'exhibition.narration.tts',
      target: stored.id,
      ...actor,
      detail: JSON.stringify({
        ok: true,
        provider: cfg.provider,
        model: cfg.model,
        chars: text.length,
        ms: Date.now() - started,
      }),
    });

    return {
      fileId: stored.id,
      url: exhibitionAssetUrl(stored.id),
      provider: cfg.provider,
      model: cfg.model,
    };
  }
}
