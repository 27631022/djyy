import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';

/** 单个图标上限(内联存 DB,故压得较小)。SVG 通常几 KB,PNG logo 几十 KB。 */
const MAX_ICON_BYTES = 512 * 1024;

/** 允许的图标 MIME → 规范化扩展名 */
const ALLOWED_MIME: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
};

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 列表/详情返回(含 dataUrl —— 图标小,直接给前端 <img> 用) */
export interface IconAssetPublic {
  id: string;
  name: string;
  mimeType: string;
  ext: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

/**
 * 中央图标库 —— 自定义上传部分。
 *
 * 设计:图标很小,**内联存 dataUrl**(不进 storage),公开页 <img> 直接能渲染、不涉鉴权。
 * 内置品牌图标(deepseek/豆包…)是前端 monogram 注册表,不进此表。
 */
@Injectable()
export class IconService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<IconAssetPublic[]> {
    const rows = await this.prisma.iconAsset.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async create(
    input: { name: string; mimeType?: string; buffer?: Buffer },
    ctx: AuditCtx,
  ): Promise<IconAssetPublic> {
    if (!input.buffer || !input.mimeType) {
      throw new BadRequestException('未收到图标文件');
    }
    const ext = ALLOWED_MIME[input.mimeType];
    if (!ext) {
      throw new BadRequestException(
        `不支持的图标格式 ${input.mimeType}(仅 SVG / PNG / WebP / JPG / GIF)`,
      );
    }
    if (input.buffer.length > MAX_ICON_BYTES) {
      throw new PayloadTooLargeException(
        `图标过大(${(input.buffer.length / 1024).toFixed(0)}KB),上限 ${MAX_ICON_BYTES / 1024}KB`,
      );
    }
    const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString('base64')}`;
    const row = await this.prisma.iconAsset.create({
      data: {
        name: input.name.trim().slice(0, 64) || '未命名图标',
        mimeType: input.mimeType,
        ext,
        size: input.buffer.length,
        dataUrl,
        createdById: ctx.actorId,
      },
    });
    await this.audit.log({
      action: 'icon.create',
      target: row.id,
      ...ctx,
      detail: JSON.stringify({
        name: row.name,
        mimeType: row.mimeType,
        size: row.size,
      }),
    });
    return this.toPublic(row);
  }

  /** 公开取字节(给 <img src="/api/public/icons/:id"> 用) */
  async getRaw(id: string): Promise<{ mimeType: string; buffer: Buffer }> {
    const row = await this.prisma.iconAsset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('图标不存在');
    const base64 = row.dataUrl.replace(/^data:[^;]+;base64,/, '');
    return { mimeType: row.mimeType, buffer: Buffer.from(base64, 'base64') };
  }

  async remove(id: string, ctx: AuditCtx): Promise<{ ok: true }> {
    const row = await this.prisma.iconAsset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('图标不存在');
    await this.prisma.iconAsset.delete({ where: { id } });
    await this.audit.log({
      action: 'icon.delete',
      target: id,
      ...ctx,
      detail: JSON.stringify({ name: row.name }),
    });
    return { ok: true };
  }

  private toPublic(r: {
    id: string;
    name: string;
    mimeType: string;
    ext: string;
    size: number;
    dataUrl: string;
    createdAt: Date;
  }): IconAssetPublic {
    return {
      id: r.id,
      name: r.name,
      mimeType: r.mimeType,
      ext: r.ext,
      size: r.size,
      dataUrl: r.dataUrl,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
