import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import {
  CreateNavCategoryDto,
  UpdateNavCategoryDto,
} from './dto/category.dto';
import { CreateNavItemDto, UpdateNavItemDto } from './dto/item.dto';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

@Injectable()
export class NavCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 公开接口:列出所有 active 分类 + items(用于前台首页) */
  async listForPortal() {
    return this.prisma.navCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  /** 后台:列出全部(含禁用),用于编辑页 */
  async listAll() {
    return this.prisma.navCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  /* ─── 分类 CRUD ─── */

  async createCategory(dto: CreateNavCategoryDto, ctx: AuditCtx) {
    const created = await this.prisma.navCategory.create({ data: dto });
    await this.audit.log({
      action: 'nav.category.create',
      target: created.id,
      ...ctx,
      detail: JSON.stringify({ code: dto.code, label: dto.label }),
    });
    return created;
  }

  async updateCategory(id: string, dto: UpdateNavCategoryDto, ctx: AuditCtx) {
    const exists = await this.prisma.navCategory.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('分类不存在');
    const updated = await this.prisma.navCategory.update({ where: { id }, data: dto });
    await this.audit.log({
      action: 'nav.category.update',
      target: id,
      ...ctx,
      detail: JSON.stringify(dto),
    });
    return updated;
  }

  async removeCategory(id: string, ctx: AuditCtx) {
    const exists = await this.prisma.navCategory.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('分类不存在');
    await this.prisma.navCategory.delete({ where: { id } });
    await this.audit.log({
      action: 'nav.category.delete',
      target: id,
      ...ctx,
      detail: JSON.stringify({ code: exists.code, label: exists.label }),
    });
    return { ok: true };
  }

  /* ─── 项目 CRUD ─── */

  async createItem(categoryId: string, dto: CreateNavItemDto, ctx: AuditCtx) {
    const cat = await this.prisma.navCategory.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('分类不存在');
    const created = await this.prisma.navItem.create({
      data: { ...dto, categoryId },
    });
    await this.audit.log({
      action: 'nav.item.create',
      target: created.id,
      ...ctx,
      detail: JSON.stringify({ categoryId, label: dto.label }),
    });
    return created;
  }

  async updateItem(itemId: string, dto: UpdateNavItemDto, ctx: AuditCtx) {
    const exists = await this.prisma.navItem.findUnique({ where: { id: itemId } });
    if (!exists) throw new NotFoundException('项目不存在');
    const updated = await this.prisma.navItem.update({ where: { id: itemId }, data: dto });
    await this.audit.log({
      action: 'nav.item.update',
      target: itemId,
      ...ctx,
      detail: JSON.stringify(dto),
    });
    return updated;
  }

  async removeItem(itemId: string, ctx: AuditCtx) {
    const exists = await this.prisma.navItem.findUnique({ where: { id: itemId } });
    if (!exists) throw new NotFoundException('项目不存在');
    await this.prisma.navItem.delete({ where: { id: itemId } });
    await this.audit.log({
      action: 'nav.item.delete',
      target: itemId,
      ...ctx,
      detail: JSON.stringify({ label: exists.label }),
    });
    return { ok: true };
  }
}
