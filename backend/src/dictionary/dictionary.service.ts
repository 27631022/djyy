import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
import { ReorderDictItemsDto } from './dto/reorder-items.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

@Injectable()
export class DictionaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ─── 字典列表(带项目数) ─── */
  async listDictionaries(includeInactive = false) {
    const where = includeInactive ? {} : { active: true };
    const dicts = await this.prisma.dictionary.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    return dicts.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      builtin: d.builtin,
      sortOrder: d.sortOrder,
      active: d.active,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      itemCount: d._count.items,
    }));
  }

  /* ─── 字典详情(含全部项目,按 parent → children 层级排序) ─── */
  async findDictionary(idOrCode: string, includeInactiveItems = false) {
    const dict = await this.findByIdOrCode(idOrCode);
    const items = await this.prisma.dictItem.findMany({
      where: { dictId: dict.id, ...(includeInactiveItems ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      id: dict.id,
      code: dict.code,
      name: dict.name,
      description: dict.description,
      builtin: dict.builtin,
      sortOrder: dict.sortOrder,
      active: dict.active,
      createdAt: dict.createdAt,
      updatedAt: dict.updatedAt,
      items,
    };
  }

  /* ─── 通过 id 或 code 查找(供其他模块调用) ─── */
  async findByIdOrCode(idOrCode: string) {
    // 先按 id (cuid 25 字符,但保险起见两边都试)
    let dict = await this.prisma.dictionary.findUnique({ where: { id: idOrCode } });
    if (!dict) dict = await this.prisma.dictionary.findUnique({ where: { code: idOrCode } });
    if (!dict) throw new NotFoundException(`字典 ${idOrCode} 不存在`);
    return dict;
  }

  /* ─── 创建字典 ─── */
  async create(input: CreateDictionaryDto, actor: ActorContext) {
    const dup = await this.prisma.dictionary.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictException(`字典代码 "${input.code}" 已被占用`);

    const created = await this.prisma.dictionary.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true,
        builtin: false,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'dictionary.create',
      target: created.id,
      detail: { code: created.code, name: created.name },
    });

    return this.findDictionary(created.id);
  }

  /* ─── 更新字典 ─── */
  async update(id: string, input: UpdateDictionaryDto, actor: ActorContext) {
    const before = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('字典不存在');

    await this.prisma.dictionary.update({ where: { id }, data: input });

    await this.audit.log({
      ...actor,
      action: 'dictionary.update',
      target: id,
      detail: {
        before: { name: before.name, description: before.description, active: before.active },
        after: input,
      },
    });

    return this.findDictionary(id);
  }

  /* ─── 删除字典(内置禁止) ─── */
  async remove(id: string, actor: ActorContext) {
    const dict = await this.prisma.dictionary.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!dict) throw new NotFoundException('字典不存在');
    if (dict.builtin) throw new BadRequestException('内置字典不可删除');

    await this.prisma.dictionary.delete({ where: { id } });

    await this.audit.log({
      ...actor,
      action: 'dictionary.delete',
      target: id,
      detail: { code: dict.code, name: dict.name, itemCount: dict._count.items },
    });

    return { id, deleted: true };
  }

  /* ─── 字典项 CRUD ─── */
  async createItem(dictId: string, input: CreateDictItemDto, actor: ActorContext) {
    const dict = await this.prisma.dictionary.findUnique({ where: { id: dictId } });
    if (!dict) throw new NotFoundException('字典不存在');

    const dup = await this.prisma.dictItem.findUnique({
      where: { dictId_code: { dictId, code: input.code } },
    });
    if (dup) throw new ConflictException(`项代码 "${input.code}" 在该字典内已存在`);

    // 校验 parentId:必须是同字典的根级项 (强制 2 级层级)
    const parentId = await this.validateParentId(dictId, input.parentId ?? null);

    const created = await this.prisma.dictItem.create({
      data: {
        dictId,
        code: input.code,
        label: input.label,
        description: input.description,
        sortOrder: input.sortOrder ?? (await this.nextSortOrder(dictId, parentId)),
        active: input.active ?? true,
        parentId,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'dict_item.create',
      target: created.id,
      detail: { dictId, code: created.code, label: created.label, parentId },
    });

    return created;
  }

  async updateItem(dictId: string, itemId: string, input: UpdateDictItemDto, actor: ActorContext) {
    const item = await this.prisma.dictItem.findFirst({ where: { id: itemId, dictId } });
    if (!item) throw new NotFoundException('字典项不存在');

    // 处理 parentId 变更
    const data: Record<string, unknown> = { ...input };
    if (input.parentId !== undefined) {
      // 不能把自己设为自己的父
      if (input.parentId === itemId) {
        throw new BadRequestException('不能把自己设为父项');
      }
      // 如果当前已是分类(被人引用),不允许变成二级项
      if (input.parentId !== null) {
        const myChildren = await this.prisma.dictItem.count({ where: { parentId: itemId } });
        if (myChildren > 0) {
          throw new BadRequestException(`此项下还有 ${myChildren} 个子项,不能降级为子项 (会形成 3 级层级)`);
        }
      }
      data.parentId = await this.validateParentId(dictId, input.parentId);
    }

    const updated = await this.prisma.dictItem.update({ where: { id: itemId }, data });

    await this.audit.log({
      ...actor,
      action: 'dict_item.update',
      target: itemId,
      detail: {
        before: { label: item.label, sortOrder: item.sortOrder, active: item.active, parentId: item.parentId },
        after: input,
      },
    });

    return updated;
  }

  async removeItem(dictId: string, itemId: string, actor: ActorContext) {
    const item = await this.prisma.dictItem.findFirst({
      where: { id: itemId, dictId },
      include: { _count: { select: { children: true } } },
    });
    if (!item) throw new NotFoundException('字典项不存在');
    if (item._count.children > 0) {
      throw new BadRequestException(
        `此分类下还有 ${item._count.children} 个子项,请先删除子项再删分类`,
      );
    }

    await this.prisma.dictItem.delete({ where: { id: itemId } });

    await this.audit.log({
      ...actor,
      action: 'dict_item.delete',
      target: itemId,
      detail: { dictId, code: item.code, label: item.label, parentId: item.parentId },
    });

    return { id: itemId, deleted: true };
  }

  /**
   * 批量重排序 — 同一父项下的兄弟项按 orderedIds 顺序重写 sortOrder。
   * 失败保护:任何 id 不属于该 dict 或该 parent 都 400,事务回滚。
   * sortOrder 以 10 为步长(0/10/20/...),给手动插入留余地。
   */
  async reorderItems(
    dictId: string,
    dto: ReorderDictItemsDto,
    actor: ActorContext,
  ) {
    const dict = await this.prisma.dictionary.findUnique({ where: { id: dictId } });
    if (!dict) throw new NotFoundException('字典不存在');

    const parentId = dto.parentId ?? null;
    // 校验:全部 id 都属于本字典 + 本父项
    const items = await this.prisma.dictItem.findMany({
      where: { id: { in: dto.orderedIds }, dictId, parentId },
      select: { id: true },
    });
    if (items.length !== dto.orderedIds.length) {
      throw new BadRequestException(
        '存在不属于该字典或父项的 id,排序拒绝(可能数据已被并发改动,请刷新后重试)',
      );
    }
    // 去重检查(同 id 不能重复出现)
    if (new Set(dto.orderedIds).size !== dto.orderedIds.length) {
      throw new BadRequestException('orderedIds 内有重复 id');
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, idx) =>
        this.prisma.dictItem.update({
          where: { id },
          data: { sortOrder: idx * 10 },
        }),
      ),
    );

    await this.audit.log({
      ...actor,
      action: 'dict_item.reorder',
      target: dictId,
      detail: { parentId, count: dto.orderedIds.length },
    });

    return { ok: true, count: dto.orderedIds.length };
  }

  /* ─── 校验 parentId:必须为 null 或同字典的根级项 ─── */
  private async validateParentId(dictId: string, parentId: string | null): Promise<string | null> {
    if (!parentId) return null;
    const parent = await this.prisma.dictItem.findFirst({ where: { id: parentId, dictId } });
    if (!parent) throw new BadRequestException(`父项 ${parentId} 不存在于本字典内`);
    if (parent.parentId !== null) {
      throw new BadRequestException('父项必须是根级项 (本字典仅支持 2 级分类)');
    }
    return parentId;
  }

  /* ─── 排序工具:同 parent 下取下一个 sortOrder ─── */
  private async nextSortOrder(dictId: string, parentId: string | null): Promise<number> {
    const last = await this.prisma.dictItem.findFirst({
      where: { dictId, parentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 10;
  }
}
