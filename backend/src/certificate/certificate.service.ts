import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

@Injectable()
export class CertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 列表 — 默认只返回 active,active=false 时返回禁用,不传返回全部 */
  async listTemplates(active?: boolean) {
    return this.prisma.certificateTemplate.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTemplate(id: string) {
    const t = await this.prisma.certificateTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('证书模板不存在');
    return t;
  }

  async createTemplate(dto: CreateTemplateDto, ctx: AuditCtx) {
    const created = await this.prisma.certificateTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        // V2 + V3 元数据(全部必填,直接落库)
        honorCode: dto.honorCode,
        honorType: dto.honorType,
        honorLevel: dto.honorLevel,
        issuingOrgName: dto.issuingOrgName,
        designJson: dto.designJson,
        thumbnail: dto.thumbnail,
        width: dto.width ?? 800,
        height: dto.height ?? 566,
        active: dto.active ?? true,
        createdBy: ctx.actorId,
      },
    });
    await this.audit.log({
      action: 'cert.template.create',
      target: created.id,
      ...ctx,
      detail: JSON.stringify({
        name: dto.name,
        category: dto.category,
        honorCode: dto.honorCode,
        honorType: dto.honorType,
        honorLevel: dto.honorLevel,
        issuingOrgName: dto.issuingOrgName,
      }),
    });
    return created;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, ctx: AuditCtx) {
    await this.getTemplate(id); // 触发 NotFound
    const updated = await this.prisma.certificateTemplate.update({
      where: { id },
      data: dto,
    });
    // audit detail 不记 designJson / thumbnail(可能很大),只记元数据变化
    const { designJson: _dj, thumbnail: _t, ...meta } = dto;
    await this.audit.log({
      action: 'cert.template.update',
      target: id,
      ...ctx,
      detail: JSON.stringify({
        ...meta,
        designJsonChanged: dto.designJson !== undefined,
        thumbnailChanged: dto.thumbnail !== undefined,
      }),
    });
    return updated;
  }

  async removeTemplate(id: string, ctx: AuditCtx) {
    const t = await this.getTemplate(id);
    await this.prisma.certificateTemplate.delete({ where: { id } });
    await this.audit.log({
      action: 'cert.template.delete',
      target: id,
      ...ctx,
      detail: JSON.stringify({ name: t.name }),
    });
    return { ok: true };
  }
}
