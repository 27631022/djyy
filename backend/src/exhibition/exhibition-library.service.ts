import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { StorageService } from '../storage';
import { AuditService } from '../audit';
import { FILE_ID_TO_URL, exhibitionAssetUrl } from './exhibition.types';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 文件型素材分类(讲解员形象包是表存的,不在此) */
export type AssetCategory = 'voice' | 'wall-texture' | 'wall-decor';

/** 各文件分类 → storage 文件夹 + 允许扩展名 */
const CATEGORY: Record<AssetCategory, { folder: string; ext: RegExp }> = {
  voice: { folder: 'library-voice', ext: /\.(mp3|wav|ogg)$/i },
  'wall-texture': { folder: 'library-wall-texture', ext: /\.(png|jpe?g|webp)$/i },
  'wall-decor': { folder: 'library-wall-decor', ext: /\.(png|jpe?g|webp|glb|gltf)$/i },
};

/** 素材库文件夹(供 ExhibitionService.collectInUseFileIds 排除 GC) */
export const EXHIBITION_LIBRARY_FOLDERS = Object.values(CATEGORY).map((c) => c.folder);

export interface AssetItem {
  id: string;
  name: string;
  size: number;
  createdAt: Date;
  url: string;
  tags: string[];
}

export interface GuidePresetItem {
  id: string;
  name: string;
  createdAt: Date;
  /** 已解析的形象包配置(*FileId 旁补 *Url,前端可直接预览/套用) */
  config: Record<string, unknown>;
}

/**
 * 展厅素材中心:讲解员「形象包」(表存,整套复用) + 文件型素材库(音色/墙面贴图/墙面装饰)。
 *  - 形象包 = HallGuide 配置子集(只存 fileId,响应时旁补 url);套用 = 整套写进某厅 meta.guide。
 *  - 文件库 = storage 共享文件夹(library-*),复用 ModelLibraryMeta 存标签、storage.rename 改名。
 *  - GC:collectInUseFileIds 把形象包引用的 fileId + 各文件库文件夹的全部文件纳入在用(否则被孤儿回收误删)。
 */
@Injectable()
export class ExhibitionLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /* ── 讲解员形象包 ── */

  async listPresets(): Promise<GuidePresetItem[]> {
    const rows = await this.prisma.exhibitionGuidePreset.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      config: this.resolve(this.parseJson<Record<string, unknown>>(r.configJson, {})),
    }));
  }

  async createPreset(
    name: string,
    config: Record<string, unknown>,
    ctx: AuditCtx,
  ): Promise<GuidePresetItem> {
    const clean = this.stripUrls(config); // 只存 fileId,剥响应态 url 键 + enabled
    const row = await this.prisma.exhibitionGuidePreset.create({
      data: {
        name: name.trim().slice(0, 64) || '未命名形象',
        configJson: JSON.stringify(clean),
        createdById: ctx.actorId,
      },
    });
    await this.audit.log({
      action: 'exhibition.guide-preset.create',
      target: row.id,
      ...ctx,
      detail: JSON.stringify({ name: row.name }),
    });
    return { id: row.id, name: row.name, createdAt: row.createdAt, config: this.resolve(clean) };
  }

  async renamePreset(id: string, name: string, ctx: AuditCtx): Promise<{ ok: true }> {
    const row = await this.prisma.exhibitionGuidePreset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('形象包不存在');
    await this.prisma.exhibitionGuidePreset.update({
      where: { id },
      data: { name: name.trim().slice(0, 64) || row.name },
    });
    await this.audit.log({ action: 'exhibition.guide-preset.rename', target: id, ...ctx });
    return { ok: true };
  }

  async deletePreset(id: string, ctx: AuditCtx): Promise<{ ok: true }> {
    await this.prisma.exhibitionGuidePreset.delete({ where: { id } }).catch(() => undefined);
    await this.audit.log({ action: 'exhibition.guide-preset.delete', target: id, ...ctx });
    return { ok: true };
  }

  /* ── 文件型素材库(音色 / 墙面贴图 / 墙面装饰)── */

  async listFiles(category: AssetCategory): Promise<AssetItem[]> {
    const cat = CATEGORY[category];
    if (!cat) throw new NotFoundException('未知素材分类');
    const files = await this.storage.list({ ownerModule: 'exhibition', folder: cat.folder, limit: 300 });
    const items: AssetItem[] = files
      .filter((f) => cat.ext.test(f.originalName))
      .map((f) => ({
        id: f.id,
        name: f.originalName,
        size: f.size,
        createdAt: f.createdAt,
        url: exhibitionAssetUrl(f.id),
        tags: [],
      }));
    if (items.length) {
      const metas = await this.prisma.modelLibraryMeta.findMany({
        where: { fileId: { in: items.map((i) => i.id) } },
      });
      const map = new Map(metas.map((m) => [m.fileId, this.parseTags(m.tags)]));
      for (const i of items) i.tags = map.get(i.id) ?? [];
    }
    return items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  async updateFile(
    category: AssetCategory,
    fileId: string,
    dto: { name?: string; tags?: string[] },
    ctx: AuditCtx,
  ): Promise<{ ok: true }> {
    const cat = CATEGORY[category];
    if (!cat) throw new NotFoundException('未知素材分类');
    const meta = await this.storage.getMeta(fileId);
    if (meta.ownerModule !== 'exhibition' || meta.folder !== cat.folder) {
      throw new NotFoundException('不是该分类的素材文件');
    }
    if (dto.name !== undefined && dto.name.trim()) {
      const extM = /\.[a-z0-9]+$/i.exec(meta.originalName);
      const ext = extM ? extM[0] : '';
      const base = dto.name.replace(/\.[a-z0-9]+$/i, '').trim();
      await this.storage.rename(fileId, `${base}${ext}`, ctx);
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
      action: 'exhibition.asset.update',
      target: fileId,
      ...ctx,
      detail: JSON.stringify({ category, name: dto.name, tags: dto.tags }),
    });
    return { ok: true };
  }

  /** GC 在用集合:形象包 config 引用的 fileId + 各素材库文件夹里的全部文件 */
  async collectInUseFileIds(): Promise<string[]> {
    const ids = new Set<string>();
    const presets = await this.prisma.exhibitionGuidePreset.findMany({ select: { configJson: true } });
    for (const p of presets) this.collectDeep(this.parseJson<unknown>(p.configJson, {}), ids);
    const lists = await Promise.all(
      EXHIBITION_LIBRARY_FOLDERS.map((folder) =>
        this.storage.list({ ownerModule: 'exhibition', folder, limit: 500 }),
      ),
    );
    for (const list of lists) for (const f of list) ids.add(f.id);
    return [...ids];
  }

  /* ── helpers ── */

  /** 形象包配置:为每个 `*FileId` 旁补 `*Url`(同 FILE_ID_TO_URL,前端预览/套用用) */
  private resolve(cfg: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...cfg };
    for (const [k, v] of Object.entries(cfg)) {
      const urlKey = FILE_ID_TO_URL[k];
      if (urlKey && typeof v === 'string' && v) out[urlKey] = exhibitionAssetUrl(v);
    }
    return out;
  }

  /** 存盘前剥掉响应态 url 键 + enabled(只留 fileId / 参数) */
  private stripUrls(cfg: Record<string, unknown>): Record<string, unknown> {
    const urlKeys = new Set(Object.values(FILE_ID_TO_URL));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (urlKeys.has(k) || k === 'enabled' || k === 'name') continue;
      out[k] = v;
    }
    return out;
  }

  private collectDeep(node: unknown, out: Set<string>): void {
    if (Array.isArray(node)) {
      for (const n of node) this.collectDeep(n, out);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if ((k === 'fileId' || k.endsWith('FileId')) && typeof v === 'string' && v) out.add(v);
        else this.collectDeep(v, out);
      }
    }
  }

  private parseJson<T>(s: string, fallback: T): T {
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
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
