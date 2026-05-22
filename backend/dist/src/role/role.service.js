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
exports.RoleService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
let RoleService = class RoleService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async list() {
        const roles = await this.prisma.role.findMany({
            orderBy: [{ builtin: 'desc' }, { code: 'asc' }],
            include: { _count: { select: { users: true, permissions: true } } },
        });
        return roles.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            description: r.description,
            builtin: r.builtin,
            createdAt: r.createdAt,
            userCount: r._count.users,
            permissionCount: r._count.permissions,
        }));
    }
    async findOne(id) {
        const r = await this.prisma.role.findUnique({
            where: { id },
            include: {
                permissions: { include: { permission: true } },
                _count: { select: { users: true } },
            },
        });
        if (!r)
            throw new common_1.NotFoundException('角色不存在');
        return {
            id: r.id,
            code: r.code,
            name: r.name,
            description: r.description,
            builtin: r.builtin,
            createdAt: r.createdAt,
            userCount: r._count.users,
            permissions: r.permissions.map((rp) => ({
                id: rp.permission.id,
                code: rp.permission.code,
                name: rp.permission.name,
                category: rp.permission.category,
                pluginName: rp.permission.pluginName,
            })),
        };
    }
    async listUsers(id) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role)
            throw new common_1.NotFoundException('角色不存在');
        const userRoles = await this.prisma.userRole.findMany({
            where: { roleId: id },
            include: {
                user: true,
                scopeOrgs: { include: { org: true } },
            },
            orderBy: [{ grantedAt: 'desc' }],
        });
        return userRoles.map((ur) => ({
            userId: ur.userId,
            username: ur.user.username,
            name: ur.user.name,
            avatarUrl: ur.user.avatarUrl,
            active: ur.user.active,
            scope: ur.scope,
            scopeOrgs: ur.scopeOrgs.map((s) => ({
                id: s.org.id,
                name: s.org.name,
                kind: s.org.kind,
            })),
            grantedAt: ur.grantedAt,
        }));
    }
    async create(input, actor) {
        const dup = await this.prisma.role.findUnique({ where: { code: input.code } });
        if (dup)
            throw new common_1.ConflictException(`code "${input.code}" 已存在`);
        const created = await this.prisma.role.create({
            data: {
                code: input.code,
                name: input.name,
                description: input.description,
                builtin: false,
            },
        });
        await this.audit.log({
            ...actor,
            action: 'role.create',
            target: created.id,
            detail: { code: created.code, name: created.name },
        });
        return this.findOne(created.id);
    }
    async update(id, input, actor) {
        const before = await this.prisma.role.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('角色不存在');
        await this.prisma.role.update({
            where: { id },
            data: {
                name: input.name ?? undefined,
                description: input.description ?? undefined,
            },
        });
        await this.audit.log({
            ...actor,
            action: 'role.update',
            target: id,
            detail: {
                before: { name: before.name, description: before.description },
                after: input,
            },
        });
        return this.findOne(id);
    }
    async remove(id, actor) {
        const r = await this.prisma.role.findUnique({
            where: { id },
            include: { _count: { select: { users: true } } },
        });
        if (!r)
            throw new common_1.NotFoundException('角色不存在');
        if (r.builtin)
            throw new common_1.BadRequestException('内置角色不可删除');
        if (r._count.users > 0) {
            throw new common_1.BadRequestException(`仍有 ${r._count.users} 个用户持有该角色,请先解除分配`);
        }
        await this.prisma.role.delete({ where: { id } });
        await this.audit.log({
            ...actor,
            action: 'role.delete',
            target: id,
            detail: { code: r.code, name: r.name },
        });
        return { id, deleted: true };
    }
    async replacePermissions(id, dto, actor) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role)
            throw new common_1.NotFoundException('角色不存在');
        const permIds = Array.from(new Set(dto.permissionIds));
        if (permIds.length > 0) {
            const found = await this.prisma.permission.count({ where: { id: { in: permIds } } });
            if (found !== permIds.length)
                throw new common_1.BadRequestException('部分权限点不存在');
        }
        await this.prisma.$transaction([
            this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
            ...(permIds.length > 0
                ? [
                    this.prisma.rolePermission.createMany({
                        data: permIds.map((pid) => ({ roleId: id, permissionId: pid })),
                    }),
                ]
                : []),
        ]);
        await this.audit.log({
            ...actor,
            action: 'role.permissions.replace',
            target: id,
            detail: { count: permIds.length },
        });
        return this.findOne(id);
    }
};
exports.RoleService = RoleService;
exports.RoleService = RoleService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], RoleService);
//# sourceMappingURL=role.service.js.map