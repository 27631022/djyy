import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { DictionaryService } from '../dictionary';
import { normalizeFieldDefs, parseFields, selectDictCodes, type TaskField } from './task-fields';
import { CreateTaskTemplateDto } from './dto/create-task-template.dto';
import { UpdateTaskTemplateDto } from './dto/update-task-template.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface TaskTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  fields: string;
  builtin: boolean;
  active: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TaskTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dictionary: DictionaryService,
  ) {}

  async list(includeInactive = true) {
    const rows = await this.prisma.taskTemplate.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map((r) => this.toPublic(r));
  }

  async findOne(id: string) {
    const r = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('任务模板不存在');
    return this.toPublic(r);
  }

  async create(dto: CreateTaskTemplateDto, actor: ActorContext) {
    const dup = await this.prisma.taskTemplate.findUnique({ where: { code: dto.code } });
    if (dup) throw new ConflictException(`模板代码 "${dto.code}" 已存在`);
    const fields = normalizeFieldDefs(dto.fields);
    await this.assertDictsExist(fields);

    const created = await this.prisma.taskTemplate.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        fields: JSON.stringify(fields),
        active: dto.active ?? true,
        createdById: actor.actorId,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'task.template.create',
      target: created.id,
      detail: { code: created.code, name: created.name, fieldCount: fields.length },
    });
    return this.toPublic(created);
  }

  async update(id: string, dto: UpdateTaskTemplateDto, actor: ActorContext) {
    const before = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('任务模板不存在');

    const data: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      category: dto.category,
      active: dto.active,
    };
    if (dto.fields !== undefined) {
      const fields = normalizeFieldDefs(dto.fields);
      await this.assertDictsExist(fields);
      data.fields = JSON.stringify(fields);
    }
    await this.prisma.taskTemplate.update({ where: { id }, data });
    await this.audit.log({
      ...actor,
      action: 'task.template.update',
      target: id,
      detail: { code: before.code },
    });
    return this.findOne(id);
  }

  async remove(id: string, actor: ActorContext) {
    const r = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('任务模板不存在');
    if (r.builtin) throw new ConflictException('内置模板不可删除,可改为禁用');
    await this.prisma.taskTemplate.delete({ where: { id } });
    await this.audit.log({
      ...actor,
      action: 'task.template.delete',
      target: id,
      detail: { code: r.code, name: r.name },
    });
    return { id, deleted: true };
  }

  /** select 字段引用的字典必须存在(不存在 DictionaryService 抛 NotFound) */
  private async assertDictsExist(fields: TaskField[]) {
    for (const code of selectDictCodes(fields)) {
      await this.dictionary.findByIdOrCode(code);
    }
  }

  private toPublic(r: TaskTemplateRow) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      fields: parseFields(r.fields),
      builtin: r.builtin,
      active: r.active,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
