import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import {
  STORAGE_DRIVER,
  type StorageDriver,
} from './drivers/storage-driver.interface';
import { ALLOWED_EXT_MIME, FILE_MAX_BYTES } from './storage.constants';

/** 对外安全投影 —— 不含字节、storageKey、driver 等内部字段 */
export interface StoredFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  ext: string | null;
  ownerModule: string;
  folder: string | null;
  visibility: string;
  createdAt: Date;
}

export interface PutFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  /** 业务来源(= 顶层文件夹),如 'certificate' | 'task' */
  ownerModule: string;
  /** 业务子文件夹,如 '2025-先进工作者'(可多级,'/' 分隔) */
  folder?: string;
  visibility?: 'private' | 'public';
  createdById?: string;
}

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** Prisma StoredFile row 的最小形状(只取本服务用到的列) */
interface StoredFileRow {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  ext: string | null;
  ownerModule: string;
  folder: string | null;
  visibility: string;
  createdAt: Date;
  deletedAt: Date | null;
}

/**
 * 文件存储门面。
 *
 * 职责:业务文件夹 key 生成 + sha256 + 增/删/取 + 元数据落库 + 审计。
 * 真实字节交给注入的 StorageDriver(本地盘 / 未来群晖·对象存储),本服务不感知后端形态。
 */
/** 定长 hex 字符串恒定时间比较(防时序侧信道) */
function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

@Injectable()
export class StorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
  ) {}

  /** 上传:校验 → 算 sha256 → 生成业务文件夹 key(冲突加后缀)→ 落字节 → 落元数据 → 审计 */
  async put(input: PutFileInput, ctx: AuditCtx): Promise<StoredFileMeta> {
    const buffer = input.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('文件为空');
    }
    if (buffer.length > FILE_MAX_BYTES) {
      throw new BadRequestException(
        `文件过大(${(buffer.length / 1024 / 1024).toFixed(1)}MB),最大支持 ${FILE_MAX_BYTES / 1024 / 1024}MB`,
      );
    }
    const { base, ext } = this.splitName(input.originalName);
    if (!ext || !ALLOWED_EXT_MIME[ext]) {
      throw new BadRequestException(
        `不支持的文件类型「.${ext || '?'}」。允许:${Object.keys(ALLOWED_EXT_MIME).join(' / ')}`,
      );
    }
    const mimeType = input.mimeType?.trim() || ALLOWED_EXT_MIME[ext];
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    const storageKey = await this.allocateKey(
      input.ownerModule,
      input.folder,
      base,
      ext,
    );
    const folder = this.sanitizeFolder(input.folder) || null;

    await this.driver.put(storageKey, buffer, mimeType);

    const row = await this.prisma.storedFile.create({
      data: {
        driver: this.driver.name,
        storageKey,
        ownerModule: input.ownerModule,
        folder,
        originalName: input.originalName.slice(0, 256),
        mimeType,
        size: buffer.length,
        sha256,
        ext,
        visibility: input.visibility ?? 'private',
        createdById: input.createdById,
      },
    });

    await this.audit.log({
      action: 'file.upload',
      target: row.id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        id: row.id,
        storageKey,
        originalName: row.originalName,
        mimeType,
        size: row.size,
        sha256,
        ownerModule: row.ownerModule,
        folder,
        // 不记字节
      }),
    });

    return this.toMeta(row);
  }

  /** 取元数据(软删 / 不存在 → NotFound) */
  async getMeta(id: string): Promise<StoredFileMeta> {
    return this.toMeta(await this.requireLive(id));
  }

  /** 取字节流(下载 / 公开页代理) */
  async getStream(
    id: string,
  ): Promise<{ meta: StoredFileMeta; stream: Readable }> {
    const row = await this.requireLive(id);
    try {
      const stream = await this.driver.getStream(row.storageKey);
      return { meta: this.toMeta(row), stream };
    } catch (e) {
      throw this.mapReadError(e);
    }
  }

  /** 取整块 Buffer(批量打 ZIP) */
  async getBuffer(
    id: string,
  ): Promise<{ meta: StoredFileMeta; buffer: Buffer }> {
    const row = await this.requireLive(id);
    try {
      const buffer = await this.driver.getBuffer(row.storageKey);
      return { meta: this.toMeta(row), buffer };
    } catch (e) {
      throw this.mapReadError(e);
    }
  }

  /**
   * 软删:置 deletedAt + 删真实字节(显式删除是管理员动作,顺手清字节,避免孤儿)。
   * 元数据行保留(审计可追),字节删除 best-effort(失败不阻断)。
   */
  async softDelete(id: string, ctx: AuditCtx): Promise<{ ok: true }> {
    const row = await this.requireLive(id);
    await this.prisma.storedFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    try {
      await this.driver.delete(row.storageKey);
    } catch {
      /* 字节删除失败留给孤儿回收,不阻断 */
    }
    await this.audit.log({
      action: 'file.delete',
      target: id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        id,
        storageKey: row.storageKey,
        originalName: row.originalName,
        ownerModule: row.ownerModule,
      }),
    });
    return { ok: true };
  }

  /**
   * 短时效签名下载 URL —— 浏览器原生下载用(无需 Bearer)。
   * 返回的 url 相对于 API base(已含 /api 前缀),前端拼 baseURL 即命中公开下载口。
   */
  signFileUrl(id: string, ttlSec = 300): { url: string; exp: number } {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = this.sign(`file:${id}:${exp}`);
    return { url: `/public/files/${id}?exp=${exp}&sig=${sig}`, exp };
  }

  /** 验签(公开下载口用) */
  verifyFileSig(id: string, exp: number, sig: string): boolean {
    if (!exp || !sig) return false;
    if (Math.floor(Date.now() / 1000) > exp) return false;
    return safeEqualHex(this.sign(`file:${id}:${exp}`), sig);
  }

  private sign(payload: string): string {
    const secret =
      this.config.get<string>('STORAGE_URL_SECRET') ||
      this.config.get<string>('AUTH_SECRET') ||
      'djyy-dev-storage-secret';
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /* ─── 内部 ─── */

  private async requireLive(id: string): Promise<StoredFileRow> {
    const row = (await this.prisma.storedFile.findUnique({
      where: { id },
    })) as StoredFileRow | null;
    if (!row || row.deletedAt) {
      throw new NotFoundException('文件不存在或已被删除');
    }
    return row;
  }

  private toMeta(row: StoredFileRow): StoredFileMeta {
    return {
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      ext: row.ext,
      ownerModule: row.ownerModule,
      folder: row.folder,
      visibility: row.visibility,
      createdAt: row.createdAt,
    };
  }

  private mapReadError(e: unknown): Error {
    const code = (e as { code?: string })?.code;
    if (code === 'ENOENT') {
      return new NotFoundException('文件字节缺失(可能已被移动或清理)');
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  /** 单个路径段清洗:去非法字符 / 折叠 .. / 截断;空则占位 '_' */
  private sanitizeSegment(s: string): string {
    const cleaned = s
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 120)
      .trim();
    return cleaned || '_';
  }

  /** 业务文件夹:按 '/' 拆段逐个清洗后重组 */
  private sanitizeFolder(folder?: string): string {
    if (!folder) return '';
    return folder
      .replace(/\\/g, '/')
      .split('/')
      .map((seg) => seg.trim())
      .filter(Boolean)
      .map((seg) => this.sanitizeSegment(seg))
      .join('/');
  }

  /** 原始名拆成 { base 清洗后主名, ext 小写无点 } */
  private splitName(originalName: string): { base: string; ext: string | null } {
    const name = (originalName || '').trim();
    const dot = name.lastIndexOf('.');
    const ext =
      dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const rawBase = dot > 0 ? name.slice(0, dot) : name;
    return { base: this.sanitizeSegment(rawBase), ext: ext || null };
  }

  /** 生成唯一 storageKey:`{ownerModule}/{folder}/{base}.{ext}`,撞名加 -2/-3 */
  private async allocateKey(
    ownerModule: string,
    folder: string | undefined,
    base: string,
    ext: string,
  ): Promise<string> {
    const prefix = [this.sanitizeSegment(ownerModule), this.sanitizeFolder(folder)]
      .filter(Boolean)
      .join('/');
    const make = (n: number) => {
      const fname = n <= 1 ? `${base}.${ext}` : `${base}-${n}.${ext}`;
      return `${prefix}/${fname}`;
    };
    let n = 1;
    // 低并发(管理员上传);@unique(storageKey) 兜底,极端竞态由 create 抛错暴露
    while (
      await this.prisma.storedFile.findUnique({
        where: { storageKey: make(n) },
      })
    ) {
      n += 1;
    }
    return make(n);
  }
}
