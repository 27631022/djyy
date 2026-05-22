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
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const replace_roles_dto_1 = require("./dto/replace-roles.dto");
const audit_service_1 = require("../audit/audit.service");
const user_custom_field_service_1 = require("../user-custom-field/user-custom-field.service");
let UserService = class UserService {
    prisma;
    audit;
    customFields;
    constructor(prisma, audit, customFields) {
        this.prisma = prisma;
        this.audit = audit;
        this.customFields = customFields;
    }
    parseCustomFields(raw) {
        if (!raw)
            return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch {
            return {};
        }
    }
    async list(query) {
        const take = query.take ?? 50;
        const skip = query.skip ?? 0;
        const where = {};
        if (query.search) {
            where.OR = [
                { name: { contains: query.search } },
                { username: { contains: query.search } },
                { email: { contains: query.search } },
            ];
        }
        if (query.active === 'true')
            where.active = true;
        if (query.active === 'false')
            where.active = false;
        if (query.adminOrgId) {
            where.memberships = { some: { orgId: query.adminOrgId, org: { kind: 'admin' } } };
        }
        if (query.partyOrgId) {
            where.memberships = {
                ...where.memberships,
                some: { orgId: query.partyOrgId, org: { kind: 'party' } },
            };
        }
        if (query.hasParty === 'true') {
            where.memberships = {
                ...where.memberships,
                some: { org: { kind: 'party' } },
            };
        }
        const orderBy = {
            [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc',
        };
        const [total, rows] = await Promise.all([
            this.prisma.user.count({ where }),
            this.prisma.user.findMany({
                where,
                orderBy,
                take,
                skip,
                include: {
                    memberships: { include: { org: true } },
                    roles: true,
                },
            }),
        ]);
        return {
            total,
            items: rows.map((u) => {
                const adminPrimary = u.memberships.find((m) => m.org.kind === 'admin' && m.isPrimary);
                const partyPrimary = u.memberships.find((m) => m.org.kind === 'party' && m.isPrimary);
                return {
                    id: u.id,
                    username: u.username,
                    name: u.name,
                    email: u.email,
                    phone: u.phone,
                    avatarUrl: u.avatarUrl,
                    active: u.active,
                    createdAt: u.createdAt,
                    primaryAdmin: adminPrimary
                        ? { orgId: adminPrimary.orgId, orgName: adminPrimary.org.name, position: adminPrimary.position }
                        : null,
                    partyAffiliation: partyPrimary
                        ? { orgId: partyPrimary.orgId, orgName: partyPrimary.org.name, position: partyPrimary.position }
                        : null,
                    membershipCount: u.memberships.length,
                    roleCount: u.roles.length,
                };
            }),
        };
    }
    async findOne(id) {
        const u = await this.prisma.user.findUnique({
            where: { id },
            include: {
                memberships: { include: { org: true }, orderBy: [{ isPrimary: 'desc' }] },
                roles: {
                    include: {
                        role: true,
                        scopeOrgs: { include: { org: true } },
                    },
                },
            },
        });
        if (!u)
            throw new common_1.NotFoundException('用户不存在');
        return {
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            phone: u.phone,
            avatarUrl: u.avatarUrl,
            active: u.active,
            externalId: u.externalId,
            customFields: this.parseCustomFields(u.customFields),
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
            memberships: {
                admin: u.memberships.filter((m) => m.org.kind === 'admin'),
                party: u.memberships.filter((m) => m.org.kind === 'party'),
            },
            roles: u.roles.map((r) => ({
                userRoleId: r.id,
                roleId: r.roleId,
                code: r.role.code,
                name: r.role.name,
                scope: r.scope,
                scopeOrgs: r.scopeOrgs.map((s) => ({
                    id: s.org.id,
                    name: s.org.name,
                    kind: s.org.kind,
                })),
                grantedAt: r.grantedAt,
            })),
        };
    }
    async replaceCustomFields(id, values, actor) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('用户不存在');
        const sanitized = await this.customFields.validateAndSanitize(values);
        await this.prisma.user.update({
            where: { id },
            data: { customFields: Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null },
        });
        await this.audit.log({
            ...actor,
            action: 'user.custom_fields.replace',
            target: id,
            detail: { keys: Object.keys(sanitized), count: Object.keys(sanitized).length },
        });
        return this.findOne(id);
    }
    async create(input, actor) {
        const existing = await this.prisma.user.findUnique({ where: { username: input.username } });
        if (existing)
            throw new common_1.ConflictException(`username "${input.username}" 已被占用`);
        if (input.email) {
            const emailDup = await this.prisma.user.findUnique({ where: { email: input.email } });
            if (emailDup)
                throw new common_1.ConflictException(`email "${input.email}" 已被占用`);
        }
        const created = await this.prisma.user.create({
            data: {
                username: input.username,
                name: input.name,
                email: input.email,
                phone: input.phone,
                avatarUrl: input.avatarUrl,
                active: input.active ?? true,
            },
        });
        await this.audit.log({
            ...actor,
            action: 'user.create',
            target: created.id,
            detail: { username: created.username, name: created.name },
        });
        return this.findOne(created.id);
    }
    async update(id, input, actor) {
        const before = await this.prisma.user.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('用户不存在');
        if (input.email && input.email !== before.email) {
            const dup = await this.prisma.user.findFirst({ where: { email: input.email, NOT: { id } } });
            if (dup)
                throw new common_1.ConflictException(`email "${input.email}" 已被其他用户占用`);
        }
        await this.prisma.user.update({
            where: { id },
            data: {
                name: input.name ?? undefined,
                email: input.email ?? undefined,
                phone: input.phone ?? undefined,
                avatarUrl: input.avatarUrl ?? undefined,
                active: input.active ?? undefined,
            },
        });
        await this.audit.log({
            ...actor,
            action: 'user.update',
            target: id,
            detail: { before: pick(before, ['name', 'email', 'phone', 'active']), after: input },
        });
        return this.findOne(id);
    }
    async softDelete(id, actor) {
        const u = await this.prisma.user.findUnique({ where: { id } });
        if (!u)
            throw new common_1.NotFoundException('用户不存在');
        if (!u.active)
            throw new common_1.BadRequestException('用户已是禁用状态');
        await this.prisma.user.update({ where: { id }, data: { active: false } });
        await this.audit.log({ ...actor, action: 'user.deactivate', target: id });
        return { id, active: false };
    }
    async replaceMemberships(id, dto, actor) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('用户不存在');
        const orgIds = dto.memberships.map((m) => m.orgId);
        if (new Set(orgIds).size !== orgIds.length) {
            throw new common_1.BadRequestException('不能为同一组织重复创建归属');
        }
        const orgs = await this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, kind: true, name: true, active: true },
        });
        if (orgs.length !== orgIds.length) {
            throw new common_1.BadRequestException('部分组织不存在');
        }
        const partyEntries = dto.memberships.filter((m) => orgs.find((o) => o.id === m.orgId)?.kind === 'party');
        if (partyEntries.length > 1)
            throw new common_1.BadRequestException('一个用户最多归属一个党组织');
        const primaryByKind = { party: 0, admin: 0 };
        for (const m of dto.memberships) {
            const kind = orgs.find((o) => o.id === m.orgId)?.kind;
            if (m.isPrimary)
                primaryByKind[kind] += 1;
        }
        if (primaryByKind.admin > 1)
            throw new common_1.BadRequestException('行政归属最多 1 个 primary');
        if (primaryByKind.party > 1)
            throw new common_1.BadRequestException('党组织归属最多 1 个 primary');
        await this.prisma.$transaction([
            this.prisma.userOrganization.deleteMany({ where: { userId: id } }),
            ...(dto.memberships.length > 0
                ? [
                    this.prisma.userOrganization.createMany({
                        data: dto.memberships.map((m) => ({
                            userId: id,
                            orgId: m.orgId,
                            position: m.position ?? null,
                            isPrimary: m.isPrimary ?? false,
                        })),
                    }),
                ]
                : []),
        ]);
        await this.audit.log({
            ...actor,
            action: 'user.memberships.replace',
            target: id,
            detail: { count: dto.memberships.length, orgIds },
        });
        return this.findOne(id);
    }
    async replaceRoles(id, dto, actor) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('用户不存在');
        const roleIds = dto.roles.map((r) => r.roleId);
        if (new Set(roleIds).size !== roleIds.length) {
            throw new common_1.BadRequestException('不能为同一角色重复分配');
        }
        if (roleIds.length > 0) {
            const found = await this.prisma.role.count({ where: { id: { in: roleIds } } });
            if (found !== roleIds.length)
                throw new common_1.BadRequestException('部分角色不存在');
        }
        const allScopeOrgIds = new Set();
        for (const r of dto.roles) {
            if (!replace_roles_dto_1.SCOPE_VALUES.includes(r.scope)) {
                throw new common_1.BadRequestException(`非法 scope: ${r.scope}`);
            }
            const hasScopeOrgs = r.scopeOrgIds && r.scopeOrgIds.length > 0;
            if (r.scope === 'custom' && !hasScopeOrgs) {
                throw new common_1.BadRequestException('scope=custom 必须至少指定一个组织 (scopeOrgIds 不能为空)');
            }
            if (r.scope !== 'custom' && hasScopeOrgs) {
                throw new common_1.BadRequestException('仅 scope=custom 时允许提供 scopeOrgIds');
            }
            r.scopeOrgIds?.forEach((oid) => allScopeOrgIds.add(oid));
        }
        if (allScopeOrgIds.size > 0) {
            const found = await this.prisma.organization.count({
                where: { id: { in: Array.from(allScopeOrgIds) } },
            });
            if (found !== allScopeOrgIds.size) {
                throw new common_1.BadRequestException('部分 scopeOrgIds 对应的组织不存在');
            }
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.userRole.deleteMany({ where: { userId: id } });
            for (const r of dto.roles) {
                const orgIds = r.scope === 'custom' ? Array.from(new Set(r.scopeOrgIds ?? [])) : [];
                await tx.userRole.create({
                    data: {
                        userId: id,
                        roleId: r.roleId,
                        scope: r.scope,
                        ...(orgIds.length > 0
                            ? { scopeOrgs: { create: orgIds.map((oid) => ({ orgId: oid })) } }
                            : {}),
                    },
                });
            }
        });
        await this.audit.log({
            ...actor,
            action: 'user.roles.replace',
            target: id,
            detail: { count: dto.roles.length, roleIds },
        });
        return this.findOne(id);
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        user_custom_field_service_1.UserCustomFieldService])
], UserService);
function pick(obj, keys) {
    const r = {};
    for (const k of keys)
        r[k] = obj[k];
    return r;
}
//# sourceMappingURL=user.service.js.map