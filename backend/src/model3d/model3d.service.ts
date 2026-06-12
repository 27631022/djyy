import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
import JSZip from 'jszip';
import { StorageService } from '../storage';
import { ExternalApiService } from '../external-api';
import { AuditService } from '../audit';
import { PromptService } from '../prompt';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 创建任务返回:火山异步任务 id(前端拿它轮询)。 */
export interface Model3dTaskCreated {
  arkTaskId: string;
  provider: string;
  model: string;
}

/** 查询任务返回:running=进行中 / done=完成(带 fileId+url) / failed=失败(带 error)。 */
export interface Model3dTaskStatus {
  status: 'running' | 'done' | 'failed';
  fileId?: string;
  url?: string;
  error?: string;
}

/** 从任务结果里尽量挖出 3D 文件 URL(各平台字段名不一,做宽松兼容)。 */
function pickFileUrl(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const buckets = [d.content, d.result, d.output, d].filter(Boolean) as Record<string, unknown>[];
  const keys = ['file_url', 'model_url', 'glb_url', 'url', 'gltf_url', 'mesh_url', 'download_url'];
  for (const b of buckets) {
    for (const k of keys) {
      const v = b[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    }
    // 再挖一层(content.data.file_url 之类)
    const data2 = b.data as Record<string, unknown> | undefined;
    if (data2) for (const k of keys) {
      const v = data2[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    }
  }
  return null;
}

/**
 * 图片 → 3D 模型生成(火山方舟 Seed3D 等,**异步任务**)。
 *
 * Seed3D 单次生成耗时数分钟,故拆成两步、**前端轮询**,不阻塞 HTTP:
 *   createTask(图片) → 调火山创建 3D 生成任务,立刻返回 arkTaskId;
 *   getTask(arkTaskId) → 查火山任务;成功则回源下载 .glb → 存 storage → 返回 fileId+url。
 * provider/model 走 external-api 的 `model3d.generate` 消费点(需配 model3d + 3d 能力)。
 */
@Injectable()
export class Model3dService {
  private readonly logger = new Logger(Model3dService.name);

  /**
   * 幂等三件套(同一 arkTaskId 只入库一次 —— 治「一次生成出多个模型」:
   * 下载入库要十几秒 > 轮询间隔 12s,setInterval 不等上次返回,排队的几个请求
   * 会各自下载入库;实测一次生成入库 5 份):
   *  - inFlight:进行中的 下载-入库 Promise,并发/排队请求共享同一个;
   *  - doneCache:已完成结果缓存,后续轮询直接返回;
   *  - 重启后两者皆空 → getTask 里再按审计日志(model3d.done)兜底查旧产物。
   */
  private readonly inFlight = new Map<string, Promise<Model3dTaskStatus>>();
  private readonly doneCache = new Map<string, Model3dTaskStatus>();
  /** createTask 登记的生成上下文(AI 起名),done 时取用;重启丢失则名字回退「3D生成」 */
  private readonly pending = new Map<string, { namePromise: Promise<string | null> }>();

  constructor(
    private readonly storage: StorageService,
    private readonly externalApi: ExternalApiService,
    private readonly audit: AuditService,
    private readonly prompts: PromptService,
  ) {}

  /** 解析 3D 生成 provider 配置(apiUrl/apiKey/model)。 */
  private async resolveCfg() {
    const cfg = await this.externalApi.getConfigForConsumer('model3d.generate');
    if (!cfg) {
      throw new BadRequestException(
        '未找到可用的「3D 生成」模型。请到「AI 接入管理」给某平台勾选 3d 能力 + 填写 model3d(如 doubao-seed3d-2-0-260328),并配好 Key。',
      );
    }
    if (!cfg.model) {
      throw new BadRequestException(`平台「${cfg.provider}」已标 3d 能力但未填 model3d。`);
    }
    if (!cfg.apiUrl) {
      throw new BadRequestException(`平台「${cfg.provider}」未配置 endpoint(apiUrl)`);
    }
    return cfg;
  }

  /** 第一步:创建 3D 生成任务,立刻返回火山任务 id(前端拿去轮询)。 */
  async createTask(
    imageFileId: string,
    actor: ActorCtx,
    opts?: { prompt?: string },
  ): Promise<Model3dTaskCreated> {
    if (!imageFileId) throw new BadRequestException('缺少图片 fileId');
    const cfg = await this.resolveCfg();

    const img = await this.storage.getBuffer(imageFileId);
    if (!img.meta.mimeType.startsWith('image/')) {
      throw new BadRequestException('上传的不是图片文件');
    }
    const imageDataUrl = `data:${img.meta.mimeType};base64,${img.buffer.toString('base64')}`;
    const apiUrl = cfg.apiUrl.replace(/\/+$/, '');

    let arkTaskId: string;
    try {
      const resp = await axios.post(
        `${apiUrl}/contents/generations/tasks`,
        {
          model: cfg.model,
          content: [
            ...(opts?.prompt?.trim() ? [{ type: 'text', text: opts.prompt.trim() }] : []),
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          timeout: 60_000,
        },
      );
      const d = resp.data as Record<string, unknown>;
      arkTaskId = String(d?.id ?? d?.task_id ?? (d?.data as Record<string, unknown>)?.id ?? '');
    } catch (e) {
      throw this.failed(e, '创建 3D 生成任务失败', cfg.provider, cfg.model, actor, imageFileId);
    }
    if (!arkTaskId) throw new BadRequestException('AI 未返回任务 id');

    // 登记生成上下文:AI 看图起名(异步跑,生成要几分钟,届时早就绪)
    this.pending.set(arkTaskId, {
      namePromise: this.suggestName(imageDataUrl).catch((e) => {
        this.logger.warn(`3D 产物起名失败(回退日期命名):${(e as Error).message}`);
        return null;
      }),
    });

    await this.audit.log({
      action: 'model3d.create',
      target: arkTaskId,
      ...actor,
      detail: JSON.stringify({ provider: cfg.provider, model: cfg.model, imageFileId }),
    });
    return { arkTaskId, provider: cfg.provider, model: cfg.model };
  }

  /** AI 看图起名(2~6 字物品名;未配 vision 模型或失败时返回 null,产物回退日期命名) */
  private async suggestName(imageDataUrl: string): Promise<string | null> {
    const cfg = await this.externalApi.getConfigForConsumer('model3d.name.vision');
    if (!cfg?.apiUrl || !cfg.model) return null;
    const prompt = await this.prompts.get('model3d.name');
    const resp = await axios.post(
      `${cfg.apiUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        model: cfg.model,
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: imageDataUrl } }],
          },
        ],
        temperature: 0.2,
        max_tokens: 30,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        timeout: 30_000,
      },
    );
    const raw = String(
      (resp.data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
        ?.content ?? '',
    );
    // 只留中英文与数字,钳到 12 字;空了就回退
    const name = raw.replace(/[^一-龥a-zA-Z0-9]/g, '').slice(0, 12);
    return name.length >= 2 ? name : null;
  }

  /**
   * 第二步:查任务;成功则下载 .glb → 存 storage → 返回 fileId+url(前端轮询直到 done/failed)。
   * 幂等:同一 arkTaskId 的并发/后续调用共享同一次入库(见类头注释),不会重复出多份模型。
   */
  async getTask(arkTaskId: string, actor: ActorCtx): Promise<Model3dTaskStatus> {
    if (!arkTaskId) throw new BadRequestException('缺少任务 id');
    const cached = this.doneCache.get(arkTaskId);
    if (cached) return cached;
    const running = this.inFlight.get(arkTaskId);
    if (running) return running;
    const p = this.getTaskInner(arkTaskId, actor)
      .then((r) => {
        if (r.status !== 'running') this.doneCache.set(arkTaskId, r);
        return r;
      })
      .finally(() => this.inFlight.delete(arkTaskId));
    this.inFlight.set(arkTaskId, p);
    return p;
  }

  private async getTaskInner(arkTaskId: string, actor: ActorCtx): Promise<Model3dTaskStatus> {
    const cfg = await this.resolveCfg();
    const apiUrl = cfg.apiUrl.replace(/\/+$/, '');
    const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};

    let data: Record<string, unknown>;
    try {
      const q = await axios.get(`${apiUrl}/contents/generations/tasks/${arkTaskId}`, {
        headers,
        timeout: 30_000,
      });
      data = q.data as Record<string, unknown>;
    } catch (e) {
      // 网络抖动 → 当作还在跑,让前端继续轮询
      this.logger.warn(`查 3D 任务失败(继续轮询):${(e as Error).message}`);
      return { status: 'running' };
    }

    const status = String(data?.status ?? data?.task_status ?? '').toLowerCase();
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      return { status: 'failed', error: String(data?.error ?? data?.failure_reason ?? status) };
    }
    if (!['succeeded', 'success', 'done', 'completed'].includes(status)) {
      return { status: 'running' };
    }

    // 服务重启后内存缓存丢:查审计有没有这个任务的入库记录,有就复用,不再重复下载
    const prior = await this.priorDone(arkTaskId);
    if (prior) return prior;

    // 成功:挖出 3D 文件 URL → 回源下载 → 存 storage
    const fileUrl = pickFileUrl(data);
    if (!fileUrl) {
      this.logger.warn(`3D 任务成功但没挖到文件 URL,原始返回:${JSON.stringify(data).slice(0, 500)}`);
      return { status: 'failed', error: '生成完成,但结果里没找到 3D 文件 URL(返回字段名可能不同,请联系开发对齐)' };
    }
    let buf: Buffer;
    try {
      const file = await axios.get<ArrayBuffer>(fileUrl, { responseType: 'arraybuffer', timeout: 120_000 });
      buf = Buffer.from(file.data);
    } catch (e) {
      return { status: 'failed', error: '下载 3D 文件失败:' + (e as Error).message };
    }
    // Seed3D 的 file_url 给的是 zip 包(实测内含 pbr/mesh_textured_pbr.glb),不解包
    // 直接当 .glb 存的话客户端解析报 "PK… is not valid JSON" —— 按魔数识别并抽出 glb
    if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
      try {
        const zip = await JSZip.loadAsync(buf);
        const entry = Object.values(zip.files).find((f) => !f.dir && /\.glb$/i.test(f.name));
        if (!entry) {
          const names = Object.keys(zip.files).slice(0, 10).join(', ');
          return { status: 'failed', error: `生成结果 zip 里没找到 .glb(内容:${names})` };
        }
        buf = Buffer.from(await entry.async('nodebuffer'));
      } catch (e) {
        return { status: 'failed', error: '解包生成结果失败:' + (e as Error).message };
      }
    }
    // 文件名:AI 看图起的物品名(createTask 时已异步在跑)-MMDD;失败回退「3D生成」
    const ctx = this.pending.get(arkTaskId);
    const objName = (ctx ? await ctx.namePromise : null) ?? '3D生成';
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(ts.getMonth() + 1)}${pad(ts.getDate())}`;
    const stored = await this.storage.put(
      {
        buffer: buf,
        originalName: `${objName}-${stamp}.glb`,
        mimeType: 'model/gltf-binary',
        ownerModule: 'model3d',
        folder: 'models',
        visibility: 'public',
        createdById: actor.actorId,
      },
      actor,
    );

    // 缩略图不在这里生成:模型库前端发现缺图时,自动用 model-viewer 渲染一帧
    // 截图上传(命名「<产物文件名>.thumb.*」同夹配对)—— 用户要的是 3D 渲染图而非源照片
    this.pending.delete(arkTaskId);

    await this.audit.log({
      action: 'model3d.done',
      target: stored.id,
      ...actor,
      detail: JSON.stringify({ arkTaskId, fileId: stored.id, size: stored.size }),
    });
    return { status: 'done', fileId: stored.id, url: `/api/public/model3d/${stored.id}` };
  }

  /** 审计里找该任务已入库的产物(服务重启后幂等兜底);产物已被删则返回 null 重新下载 */
  private async priorDone(arkTaskId: string): Promise<Model3dTaskStatus | null> {
    try {
      const { items } = await this.audit.list({ action: 'model3d.done', take: 100 });
      for (const it of items as { detail?: unknown }[]) {
        const d = this.parseDetail(it.detail);
        if (d?.arkTaskId === arkTaskId && typeof d.fileId === 'string') {
          try {
            await this.storage.getMeta(d.fileId);
            return { status: 'done', fileId: d.fileId, url: `/api/public/model3d/${d.fileId}` };
          } catch {
            return null; // 旧产物已删,重新下载
          }
        }
      }
    } catch (e) {
      this.logger.warn(`审计兜底查询失败(按未入库处理):${(e as Error).message}`);
    }
    return null;
  }

  /** 审计 detail 兼容解析(本模块写入时已 stringify 过一层,list 反序列化后仍是字符串) */
  private parseDetail(detail: unknown): Record<string, unknown> | null {
    if (detail && typeof detail === 'object') return detail as Record<string, unknown>;
    if (typeof detail === 'string') {
      try {
        return JSON.parse(detail) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }

  private failed(
    e: unknown,
    prefix: string,
    provider: string,
    model: string,
    actor: ActorCtx,
    target: string,
  ): BadRequestException {
    const err = e as AxiosError<{ error?: { message?: string }; message?: string }>;
    const msg =
      err.response?.data?.error?.message ??
      err.response?.data?.message ??
      err.message ??
      '未知错误';
    this.logger.warn(`${prefix} provider=${provider} model=${model}: ${msg}`);
    void this.audit.log({
      action: 'model3d.create',
      target,
      ...actor,
      detail: JSON.stringify({ ok: false, provider, model, msg }),
    });
    return new BadRequestException(`${prefix}:${msg}`);
  }
}
