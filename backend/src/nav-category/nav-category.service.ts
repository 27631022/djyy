import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import {
  CreateNavCategoryDto,
  UpdateNavCategoryDto,
} from './dto/category.dto';
import { CreateNavItemDto, UpdateNavItemDto } from './dto/item.dto';
import {
  ReorderNavCategoriesDto,
  ReorderNavItemsDto,
} from './dto/reorder.dto';

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

  /* ─── 拖拽排序 ─── */

  /**
   * 一级分类批量重排序。
   * orderedIds 必须覆盖且只包含数据库里全部 NavCategory(否则 400),
   * 这样能避免"前端传了过期列表,旧分类丢了 sortOrder"导致的隐性排序错乱。
   *
   * sortOrder 以 10 为步长,后续单条编辑想插队时(改 dialog 里的 sortOrder)
   * 有可用间隙不必触发整体重排。
   */
  async reorderCategories(dto: ReorderNavCategoriesDto, ctx: AuditCtx) {
    const ids = dto.orderedIds;
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('orderedIds 内有重复 id');
    }
    const allCats = await this.prisma.navCategory.findMany({ select: { id: true } });
    if (allCats.length !== ids.length) {
      throw new BadRequestException(
        '排序列表数量与现存分类不一致,可能数据已被并发修改,请刷新后重试',
      );
    }
    const existing = new Set(allCats.map((c) => c.id));
    for (const id of ids) {
      if (!existing.has(id)) {
        throw new BadRequestException(`分类 ${id} 不存在,排序拒绝`);
      }
    }
    await this.prisma.$transaction(
      ids.map((id, idx) =>
        this.prisma.navCategory.update({
          where: { id },
          data: { sortOrder: idx * 10 },
        }),
      ),
    );
    await this.audit.log({
      action: 'nav.category.reorder',
      target: 'nav-categories',
      ...ctx,
      detail: JSON.stringify({ count: ids.length }),
    });
    return { ok: true, count: ids.length };
  }

  /**
   * 同一分类下的 NavItem 批量重排序。
   * 校验:所有 id 都属于这个 categoryId,否则 400(防止跨分类拖拽错乱)。
   */
  async reorderItems(
    categoryId: string,
    dto: ReorderNavItemsDto,
    ctx: AuditCtx,
  ) {
    const cat = await this.prisma.navCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!cat) throw new NotFoundException('分类不存在');

    const ids = dto.orderedIds;
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('orderedIds 内有重复 id');
    }
    const items = await this.prisma.navItem.findMany({
      where: { id: { in: ids }, categoryId },
      select: { id: true },
    });
    if (items.length !== ids.length) {
      throw new BadRequestException(
        '存在不属于该分类的 id,排序拒绝(可能数据已被并发修改,请刷新后重试)',
      );
    }
    await this.prisma.$transaction(
      ids.map((id, idx) =>
        this.prisma.navItem.update({
          where: { id },
          data: { sortOrder: idx * 10 },
        }),
      ),
    );
    await this.audit.log({
      action: 'nav.item.reorder',
      target: categoryId,
      ...ctx,
      detail: JSON.stringify({ categoryId, count: ids.length }),
    });
    return { ok: true, count: ids.length };
  }
}
