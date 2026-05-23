import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

@Injectable()
export class UserCustomFieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 列出所有字段定义(含禁用,按 sortOrder) */
  async list(includeInactive = true) {
    return this.prisma.userCustomField.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 拿到当前所有 active 字段,前端动态渲染表单时用 */
  async listActive() {
    return this.prisma.userCustomField.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const f = await this.prisma.userCustomField.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('字段不存在');
    return f;
  }

  async create(input: CreateCustomFieldDto, actor: ActorContext) {
    const dup = await this.prisma.userCustomField.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictException(`字段代码 "${input.code}" 已存在`);

    if (input.type === 'select') {
      if (!input.dictCode) throw new BadRequestException('select 类型必须提供 dictCode');
      const dict = await this.prisma.dictionary.findUnique({ where: { code: input.dictCode } });
      if (!dict) throw new BadRequestException(`字典 "${input.dictCode}" 不存在`);
    } else if (input.dictCode) {
      throw new BadRequestException('非 select 类型不允许提供 dictCode');
    }

    const created = await this.prisma.userCustomField.create({
      data: {
        code: input.code,
        label: input.label,
        type: input.type,
        dictCode: input.type === 'select' ? input.dictCode : null,
        placeholder: input.placeholder,
        description: input.description,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true,
        builtin: false,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'custom_field.create',
      target: created.id,
      detail: { code: created.code, label: created.label, type: created.type },
    });

    return created;
  }

  async update(id: string, input: UpdateCustomFieldDto, actor: ActorContext) {
    const before = await this.prisma.userCustomField.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('字段不存在');

    const nextType = input.type ?? before.type;
    if (nextType === 'select') {
      const nextDict = input.dictCode !== undefined ? input.dictCode : before.dictCode;
      if (!nextDict) throw new BadRequestException('select 类型必须配置 dictCode');
      const dict = await this.prisma.dictionary.findUnique({ where: { code: nextDict } });
      if (!dict) throw new BadRequestException(`字典 "${nextDict}" 不存在`);
    } else if (input.dictCode) {
      throw new BadRequestException('非 select 类型不允许提供 dictCode');
    }

    const data: Record<string, unknown> = {
      label: input.label,
      type: input.type,
      placeholder: input.placeholder,
      description: input.description,
      required: input.required,
      sortOrder: input.sortOrder,
      active: input.active,
    };
    // dictCode 仅在 select 时保留,其它类型置 null
    if (nextType !== 'select') {
      data.dictCode = null;
    } else if (input.dictCode !== undefined) {
      data.dictCode = input.dictCode;
    }

    await this.prisma.userCustomField.update({ where: { id }, data });

    await this.audit.log({
      ...actor,
      action: 'custom_field.update',
      target: id,
      detail: {
        before: { label: before.label, type: before.type, active: before.active },
        after: input,
      },
    });

    return this.findOne(id);
  }

  async remove(id: string, actor: ActorContext) {
    const f = await this.prisma.userCustomField.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('字段不存在');
    if (f.builtin) throw new BadRequestException('内置字段不可删除,可改为禁用');

    await this.prisma.userCustomField.delete({ where: { id } });

    await this.audit.log({
      ...actor,
      action: 'custom_field.delete',
      target: id,
      detail: { code: f.code, label: f.label },
    });

    return { id, deleted: true };
  }

  /**
   * 校验一个 customFields 值表,对应字段定义。
   * - 未知字段直接丢弃 (避免脏数据)
   * - 必填且空值时抛错
   * - select 类型校验值是字典内合法 code
   * 返回净化后的对象 (所有 key 都对应 active 字段定义)
   */
  async validateAndSanitize(values: Record<string, string>): Promise<Record<string, string>> {
    const defs = await this.prisma.userCustomField.findMany({ where: { active: true } });
    const result: Record<string, string> = {};
    const missingRequired: string[] = [];

    for (const def of defs) {
      const raw = values[def.code];
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (!trimmed) {
        if (def.required) missingRequired.push(`${def.label} (${def.code})`);
        continue;  // 空值不写入
      }

      // select 校验
      if (def.type === 'select' && def.dictCode) {
        const item = await this.prisma.dictItem.findFirst({
          where: { dict: { code: def.dictCode }, code: trimmed, active: true },
        });
        if (!item) {
          throw new BadRequestException(`字段 "${def.label}" 的值 "${trimmed}" 不在字典 ${def.dictCode} 中`);
        }
      }

      // 数字/日期格式宽松校验
      if (def.type === 'number' && Number.isNaN(Number(trimmed))) {
        throw new BadRequestException(`字段 "${def.label}" 必须是数字,当前 "${trimmed}"`);
      }
      if (def.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        throw new BadRequestException(`字段 "${def.label}" 必须是 YYYY-MM-DD 格式日期`);
      }

      result[def.code] = trimmed;
    }

    if (missingRequired.length > 0) {
      throw new BadRequestException(`以下必填字段未填: ${missingRequired.join(', ')}`);
    }

    return result;
  }
}
