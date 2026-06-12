import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { StorageService, type StoredFileMeta } from '../storage';
import { AuditService } from '../audit';
import { exhibitionAssetUrl } from './exhibition.types';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 模型库条目(上传库 + AI 生成历史 两源合并) */
export interface LibraryModelItem {
  id: string; // storage fileId(模型台 content.modelFileId 直接用)
  name: string;
  size: number;
  createdAt: Date;
  /** upload=手动上传(exhibition/model-library 文件夹) / ai=3D 生成产物(model3d/models) */
  source: 'upload' | 'ai';
  /** 公开预览/加载 URL(素材口) */
  url: string;
  /** 分类标签(ModelLibraryMeta 覆盖表) */
  tags: string[];
  /** 物品截图(AI 生成的 = 源图副本「<产物名>.thumb.*」;卡片默认显示,点击才载 3D) */
  thumbUrl?: string;
}

const MODEL_EXT = /\.(glb|gltf)$/i;
const THUMB_RE = /^(.+\.(?:glb|gltf))\.thumb\.(jpe?g|png|webp)$/i;

/**
 * 模型库逻辑:两源列表(+标签/缩略图 join)、改名、打标签。
 *  - 名字直接存 StoredFile.originalName(storage.rename);
 *  - 标签存本模块 ModelLibraryMeta(fileId 松引用,删模型后残留行无害);
 *  - 缩略图按命名约定「<产物文件名>.thumb.<ext>」与产物同夹配对(model3d 生成时落的)。
 */
@Injectable()
export class ExhibitionModelLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<LibraryModelItem[]> {
    const [uploaded, generated] = await Promise.all([
      this.storage.list({ ownerModule: 'exhibition', folder: 'model-library', limit: 200 }),
      this.storage.list({ ownerModule: 'model3d', folder: 'models', limit: 200 }),
    ]);
    // 缩略图按名字配对(同夹的 <模型文件名>.thumb.* —— 模型库前端用 model-viewer
    // 截的 3D 渲染图,上传/AI 两源都有)
    const thumbOf = new Map<string, string>();
    for (const f of [...uploaded, ...generated]) {
      const m = THUMB_RE.exec(f.originalName);
      if (m) thumbOf.set(m[1], exhibitionAssetUrl(f.id));
    }
    const toItem = (m: StoredFileMeta, source: 'upload' | 'ai'): LibraryModelItem => ({
      id: m.id,
      name: m.originalName,
      size: m.size,
      createdAt: m.createdAt,
      source,
      url: exhibitionAssetUrl(m.id),
      tags: [],
      ...(thumbOf.has(m.originalName) ? { thumbUrl: thumbOf.get(m.originalName) } : {}),
    });
    const models = [
      ...uploaded.filter((m) => MODEL_EXT.test(m.originalName)).map((m) => toItem(m, 'upload')),
      ...generated.filter((m) => MODEL_EXT.test(m.originalName)).map((m) => toItem(m, 'ai')),
    ];
    if (models.length) {
      const metas = await this.prisma.modelLibraryMeta.findMany({
        where: { fileId: { in: models.map((m) => m.id) } },
      });
      const tagMap = new Map(metas.map((x) => [x.fileId, this.parseTags(x.tags)]));
      for (const m of models) m.tags = tagMap.get(m.id) ?? [];
    }
    return models.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  /** 改名(自动保留 .glb/.gltf 扩展名,AI 产物同步改缩略图名维持配对)/ 打标签 */
  async update(
    fileId: string,
    dto: { name?: string; tags?: string[] },
    ctx: AuditCtx,
  ): Promise<{ ok: true }> {
    const meta = await this.storage.getMeta(fileId);
    const inLibrary =
      (meta.ownerModule === 'exhibition' && meta.folder === 'model-library') ||
      (meta.ownerModule === 'model3d' && meta.folder === 'models');
    if (!inLibrary || !MODEL_EXT.test(meta.originalName)) {
      throw new NotFoundException('不是模型库文件');
    }

    if (dto.name !== undefined && dto.name.trim()) {
      const ext = MODEL_EXT.exec(meta.originalName)?.[0] ?? '.glb';
      const base = dto.name.replace(MODEL_EXT, '').trim();
      const renamed = await this.storage.rename(fileId, `${base}${ext}`, ctx);
      // 同步改缩略图名(配对靠名字,在模型自己的 模块+文件夹 里找);失败不阻断
      const thumb = await this.findThumb(meta.ownerModule, meta.folder ?? '', meta.originalName);
      if (thumb) {
        const thumbExt = /\.thumb\.(\w+)$/i.exec(thumb.originalName)?.[1] ?? 'png';
        await this.storage
          .rename(thumb.id, `${renamed.originalName}.thumb.${thumbExt}`, ctx)
          .catch(() => undefined);
      }
    }

    if (dto.tags !== undefined) {
      const tags = [...new Set(dto.tags.map((t) => t.trim()).filter(Boolean))]
        .slice(0, 8)
        .map((t) => t.slice(0, 16));
      await this.prisma.modelLibraryMeta.upsert({
        where: { fileId },
        create: { fileId, tags: JSON.stringify(tags) },
        update: { tags: JSON.stringify(tags) },
      });
    }

    await this.audit.log({
      action: 'exhibition.model.update',
      target: fileId,
      ...ctx,
      detail: JSON.stringify({ name: dto.name, tags: dto.tags }),
    });
    return { ok: true };
  }

  private async findThumb(
    ownerModule: string,
    folder: string,
    modelName: string,
  ): Promise<StoredFileMeta | null> {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      const f = await this.storage.findByName(ownerModule, folder, `${modelName}.thumb.${ext}`);
      if (f) return f;
    }
    return null;
  }

  private parseTags(s: string): string[] {
    try {
      const v = JSON.parse(s) as unknown;
      return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
    } catch {
      return [];
    }
  }
}
