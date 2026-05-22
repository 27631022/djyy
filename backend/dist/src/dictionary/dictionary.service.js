"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DictionaryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
let DictionaryService = class DictionaryService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
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
    async findDictionary(idOrCode, includeInactiveItems = false) {
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
    async findByIdOrCode(idOrCode) {
        let dict = await this.prisma.dictionary.findUnique({ where: { id: idOrCode } });
        if (!dict)
            dict = await this.prisma.dictionary.findUnique({ where: { code: idOrCode } });
        if (!dict)
            throw new common_1.NotFoundException(`字典 ${idOrCode} 不存在`);
        return dict;
    }
    async create(input, actor) {
        const dup = await this.prisma.dictionary.findUnique({ where: { code: input.code } });
        if (dup)
            throw new common_1.ConflictException(`字典代码 "${input.code}" 已被占用`);
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
    async update(id, input, actor) {
        const before = await this.prisma.dictionary.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('字典不存在');
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
    async remove(id, actor) {
        const dict = await this.prisma.dictionary.findUnique({
            where: { id },
            include: { _count: { select: { items: true } } },
        });
        if (!dict)
            throw new common_1.NotFoundException('字典不存在');
        if (dict.builtin)
            throw new common_1.BadRequestException('内置字典不可删除');
        await this.prisma.dictionary.delete({ where: { id } });
        await this.audit.log({
            ...actor,
            action: 'dictionary.delete',
            target: id,
            detail: { code: dict.code, name: dict.name, itemCount: dict._count.items },
        });
        return { id, deleted: true };
    }
    async createItem(dictId, input, actor) {
        const dict = await this.prisma.dictionary.findUnique({ where: { id: dictId } });
        if (!dict)
            throw new common_1.NotFoundException('字典不存在');
        const dup = await this.prisma.dictItem.findUnique({
            where: { dictId_code: { dictId, code: input.code } },
        });
        if (dup)
            throw new common_1.ConflictException(`项代码 "${input.code}" 在该字典内已存在`);
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
    async updateItem(dictId, itemId, input, actor) {
        const item = await this.prisma.dictItem.findFirst({ where: { id: itemId, dictId } });
        if (!item)
            throw new common_1.NotFoundException('字典项不存在');
        const data = { ...input };
        if (input.parentId !== undefined) {
            if (input.parentId === itemId) {
                throw new common_1.BadRequestException('不能把自己设为父项');
            }
            if (input.parentId !== null) {
                const myChildren = await this.prisma.dictItem.count({ where: { parentId: itemId } });
                if (myChildren > 0) {
                    throw new common_1.BadRequestException(`此项下还有 ${myChildren} 个子项,不能降级为子项 (会形成 3 级层级)`);
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
    async removeItem(dictId, itemId, actor) {
        const item = await this.prisma.dictItem.findFirst({
            where: { id: itemId, dictId },
            include: { _count: { select: { children: true } } },
        });
        if (!item)
            throw new common_1.NotFoundException('字典项不存在');
        if (item._count.children > 0) {
            throw new common_1.BadRequestException(`此分类下还有 ${item._count.children} 个子项,请先删除子项再删分类`);
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
    async validateParentId(dictId, parentId) {
        if (!parentId)
            return null;
        const parent = await this.prisma.dictItem.findFirst({ where: { id: parentId, dictId } });
        if (!parent)
            throw new common_1.BadRequestException(`父项 ${parentId} 不存在于本字典内`);
        if (parent.parentId !== null) {
            throw new common_1.BadRequestException('父项必须是根级项 (本字典仅支持 2 级分类)');
        }
        return parentId;
    }
    async nextSortOrder(dictId, parentId) {
        const last = await this.prisma.dictItem.findFirst({
            where: { dictId, parentId },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
        });
        return (last?.sortOrder ?? 0) + 10;
    }
};
exports.DictionaryService = DictionaryService;
exports.DictionaryService = DictionaryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], DictionaryService);
//# sourceMappingURL=dictionary.service.js.map