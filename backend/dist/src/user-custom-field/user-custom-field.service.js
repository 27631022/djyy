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
exports.UserCustomFieldService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
let UserCustomFieldService = class UserCustomFieldService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async list(includeInactive = true) {
        return this.prisma.userCustomField.findMany({
            where: includeInactive ? {} : { active: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }
    async listActive() {
        return this.prisma.userCustomField.findMany({
            where: { active: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }
    async findOne(id) {
        const f = await this.prisma.userCustomField.findUnique({ where: { id } });
        if (!f)
            throw new common_1.NotFoundException('字段不存在');
        return f;
    }
    async create(input, actor) {
        const dup = await this.prisma.userCustomField.findUnique({ where: { code: input.code } });
        if (dup)
            throw new common_1.ConflictException(`字段代码 "${input.code}" 已存在`);
        if (input.type === 'select') {
            if (!input.dictCode)
                throw new common_1.BadRequestException('select 类型必须提供 dictCode');
            const dict = await this.prisma.dictionary.findUnique({ where: { code: input.dictCode } });
            if (!dict)
                throw new common_1.BadRequestException(`字典 "${input.dictCode}" 不存在`);
        }
        else if (input.dictCode) {
            throw new common_1.BadRequestException('非 select 类型不允许提供 dictCode');
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
    async update(id, input, actor) {
        const before = await this.prisma.userCustomField.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('字段不存在');
        const nextType = input.type ?? before.type;
        if (nextType === 'select') {
            const nextDict = input.dictCode !== undefined ? input.dictCode : before.dictCode;
            if (!nextDict)
                throw new common_1.BadRequestException('select 类型必须配置 dictCode');
            const dict = await this.prisma.dictionary.findUnique({ where: { code: nextDict } });
            if (!dict)
                throw new common_1.BadRequestException(`字典 "${nextDict}" 不存在`);
        }
        else if (input.dictCode) {
            throw new common_1.BadRequestException('非 select 类型不允许提供 dictCode');
        }
        const data = {
            label: input.label,
            type: input.type,
            placeholder: input.placeholder,
            description: input.description,
            required: input.required,
            sortOrder: input.sortOrder,
            active: input.active,
        };
        if (nextType !== 'select') {
            data.dictCode = null;
        }
        else if (input.dictCode !== undefined) {
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
    async remove(id, actor) {
        const f = await this.prisma.userCustomField.findUnique({ where: { id } });
        if (!f)
            throw new common_1.NotFoundException('字段不存在');
        if (f.builtin)
            throw new common_1.BadRequestException('内置字段不可删除,可改为禁用');
        await this.prisma.userCustomField.delete({ where: { id } });
        await this.audit.log({
            ...actor,
            action: 'custom_field.delete',
            target: id,
            detail: { code: f.code, label: f.label },
        });
        return { id, deleted: true };
    }
    async validateAndSanitize(values) {
        const defs = await this.prisma.userCustomField.findMany({ where: { active: true } });
        const result = {};
        const missingRequired = [];
        for (const def of defs) {
            const raw = values[def.code];
            const trimmed = typeof raw === 'string' ? raw.trim() : '';
            if (!trimmed) {
                if (def.required)
                    missingRequired.push(`${def.label} (${def.code})`);
                continue;
            }
            if (def.type === 'select' && def.dictCode) {
                const item = await this.prisma.dictItem.findFirst({
                    where: { dict: { code: def.dictCode }, code: trimmed, active: true },
                });
                if (!item) {
                    throw new common_1.BadRequestException(`字段 "${def.label}" 的值 "${trimmed}" 不在字典 ${def.dictCode} 中`);
                }
            }
            if (def.type === 'number' && Number.isNaN(Number(trimmed))) {
                throw new common_1.BadRequestException(`字段 "${def.label}" 必须是数字,当前 "${trimmed}"`);
            }
            if (def.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                throw new common_1.BadRequestException(`字段 "${def.label}" 必须是 YYYY-MM-DD 格式日期`);
            }
            result[def.code] = trimmed;
        }
        if (missingRequired.length > 0) {
            throw new common_1.BadRequestException(`以下必填字段未填: ${missingRequired.join(', ')}`);
        }
        return result;
    }
};
exports.UserCustomFieldService = UserCustomFieldService;
exports.UserCustomFieldService = UserCustomFieldService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], UserCustomFieldService);
//# sourceMappingURL=user-custom-field.service.js.map