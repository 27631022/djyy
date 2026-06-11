import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
import JSZip from 'jszip';
import { StorageService } from '../storage';
import { ExternalApiService } from '../external-api';
import { AuditService } from '../audit';

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

  constructor(
    private readonly storage: StorageService,
    private readonly externalApi: ExternalApiService,
    private readonly audit: AuditService,
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

    await this.audit.log({
      action: 'model3d.create',
      target: arkTaskId,
      ...actor,
      detail: JSON.stringify({ provider: cfg.provider, model: cfg.model, imageFileId }),
    });
    return { arkTaskId, provider: cfg.provider, model: cfg.model };
  }

  /** 第二步:查任务;成功则下载 .glb → 存 storage → 返回 fileId+url(前端每 ~15s 调一次直到 done/failed)。 */
  async getTask(arkTaskId: string, actor: ActorCtx): Promise<Model3dTaskStatus> {
    if (!arkTaskId) throw new BadRequestException('缺少任务 id');
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
    // 可读文件名(模型库里要靠名字区分):3D生成-YYYYMMDD-HHmm.glb
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}`;
    const stored = await this.storage.put(
      {
        buffer: buf,
        originalName: `3D生成-${stamp}.glb`,
        mimeType: 'model/gltf-binary',
        ownerModule: 'model3d',
        folder: 'models',
        visibility: 'public',
        createdById: actor.actorId,
      },
      actor,
    );
    await this.audit.log({
      action: 'model3d.done',
      target: stored.id,
      ...actor,
      detail: JSON.stringify({ arkTaskId, fileId: stored.id, size: stored.size }),
    });
    return { status: 'done', fileId: stored.id, url: `/api/public/model3d/${stored.id}` };
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
