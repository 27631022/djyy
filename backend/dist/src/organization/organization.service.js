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
exports.OrganizationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const create_organization_dto_1 = require("./dto/create-organization.dto");
let OrganizationService = class OrganizationService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    validateKindType(kind, type) {
        const allowed = kind === 'party' ? create_organization_dto_1.PARTY_TYPES : create_organization_dto_1.ADMIN_TYPES;
        if (!allowed.includes(type)) {
            throw new common_1.BadRequestException(`kind=${kind} 下不允许 type=${type},允许的类型: ${allowed.join(', ')}`);
        }
    }
    async findAll(opts = {}) {
        const where = {};
        if (!opts.includeInactive)
            where.active = true;
        if (opts.kind)
            where.kind = opts.kind;
        return this.prisma.organization.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }
    async findTree(opts = {}) {
        const flat = await this.findAll(opts);
        const memberships = await this.prisma.userOrganization.findMany({
            select: { userId: true, orgId: true },
        });
        const directByOrg = new Map();
        memberships.forEach((m) => {
            if (!directByOrg.has(m.orgId))
                directByOrg.set(m.orgId, new Set());
            directByOrg.get(m.orgId).add(m.userId);
        });
        const map = new Map();
        flat.forEach((o) => {
            map.set(o.id, {
                ...o,
                children: [],
                directMembers: directByOrg.get(o.id)?.size ?? 0,
                transitiveMembers: 0,
            });
        });
        const roots = [];
        flat.forEach((o) => {
            const node = map.get(o.id);
            if (o.parentId && map.has(o.parentId)) {
                map.get(o.parentId).children.push(node);
            }
            else {
                roots.push(node);
            }
        });
        const computeTransitive = (node) => {
            const all = new Set(directByOrg.get(node.id) ?? []);
            for (const c of node.children) {
                computeTransitive(c).forEach((u) => all.add(u));
            }
            node.transitiveMembers = all.size;
            return all;
        };
        roots.forEach(computeTransitive);
        return roots;
    }
    async listMembers(id, recursive = false) {
        await this.findOne(id);
        let orgIds;
        if (recursive) {
            const desc = await this.collectDescendantIds(id);
            orgIds = [id, ...desc];
        }
        else {
            orgIds = [id];
        }
        const rows = await this.prisma.userOrganization.findMany({
            where: { orgId: { in: orgIds } },
            include: {
                user: { select: { id: true, username: true, name: true } },
                org: { select: { id: true, name: true } },
            },
        });
        const byUser = new Map();
        for (const r of rows) {
            const isDirect = r.orgId === id;
            const existing = byUser.get(r.userId);
            const m = {
                userId: r.userId,
                username: r.user.username,
                name: r.user.name,
                viaOrgId: r.org.id,
                viaOrgName: r.org.name,
                position: r.position,
                isPrimary: r.isPrimary,
                isDirect,
            };
            if (!existing) {
                byUser.set(r.userId, m);
                continue;
            }
            if (m.isDirect && !existing.isDirect)
                byUser.set(r.userId, m);
            else if (m.isDirect === existing.isDirect && m.isPrimary && !existing.isPrimary) {
                byUser.set(r.userId, m);
            }
        }
        return Array.from(byUser.values()).sort((a, b) => {
            if (a.isDirect !== b.isDirect)
                return a.isDirect ? -1 : 1;
            if (a.isPrimary !== b.isPrimary)
                return a.isPrimary ? -1 : 1;
            return a.name.localeCompare(b.name, 'zh');
        });
    }
    async findOne(id) {
        const org = await this.prisma.organization.findUnique({ where: { id } });
        if (!org)
            throw new common_1.NotFoundException(`组织 ${id} 不存在`);
        return org;
    }
    async create(dto) {
        this.validateKindType(dto.kind, dto.type);
        if (dto.parentId) {
            const parent = await this.prisma.organization.findUnique({ where: { id: dto.parentId } });
            if (!parent)
                throw new common_1.BadRequestException(`父组织 ${dto.parentId} 不存在`);
            if (parent.kind !== dto.kind) {
                throw new common_1.BadRequestException(`kind=${dto.kind} 的组织不能挂到 kind=${parent.kind} 的父节点下`);
            }
        }
        const codeDup = await this.prisma.organization.findUnique({ where: { code: dto.code } });
        if (codeDup)
            throw new common_1.ConflictException(`组织编码 ${dto.code} 已被占用`);
        const nameDup = await this.prisma.organization.findFirst({
            where: { name: dto.name, kind: dto.kind },
        });
        if (nameDup) {
            const kindLabel = dto.kind === 'party' ? '党组织' : '行政机构';
            throw new common_1.ConflictException(`${kindLabel}内已存在名称 "${dto.name}"`);
        }
        return this.prisma.organization.create({ data: { ...dto, parentId: dto.parentId ?? null } });
    }
    async move(sourceId, targetId, position) {
        if (sourceId === targetId) {
            throw new common_1.BadRequestException('源节点和目标节点相同');
        }
        const source = await this.findOne(sourceId);
        const target = await this.findOne(targetId);
        if (source.kind !== target.kind) {
            throw new common_1.BadRequestException(`不能跨树拖拽:${source.kind} → ${target.kind}`);
        }
        const newParentId = position === 'inside' ? target.id : target.parentId;
        if (newParentId) {
            if (newParentId === sourceId) {
                throw new common_1.BadRequestException('不能挂到自己');
            }
            const descendants = await this.collectDescendantIds(sourceId);
            if (descendants.has(newParentId)) {
                throw new common_1.BadRequestException('不能挂到自己的子孙节点下');
            }
        }
        const siblings = await this.prisma.organization.findMany({
            where: {
                parentId: newParentId,
                active: true,
                NOT: { id: sourceId },
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        let insertIndex;
        if (position === 'inside') {
            insertIndex = siblings.length;
        }
        else {
            const targetIdx = siblings.findIndex((s) => s.id === targetId);
            if (targetIdx === -1) {
                insertIndex = siblings.length;
            }
            else {
                insertIndex = position === 'before' ? targetIdx : targetIdx + 1;
            }
        }
        const final = [...siblings];
        const sourceRow = { ...source, parentId: newParentId };
        final.splice(insertIndex, 0, sourceRow);
        await this.prisma.$transaction(final.map((node, idx) => {
            const newSortOrder = (idx + 1) * 10;
            if (node.id === sourceId) {
                return this.prisma.organization.update({
                    where: { id: sourceId },
                    data: { parentId: newParentId, sortOrder: newSortOrder },
                });
            }
            return this.prisma.organization.update({
                where: { id: node.id },
                data: { sortOrder: newSortOrder },
            });
        }));
        return this.findOne(sourceId);
    }
    async update(id, dto) {
        const current = await this.findOne(id);
        const nextKind = (dto.kind ?? current.kind);
        const nextType = dto.type ?? current.type;
        this.validateKindType(nextKind, nextType);
        if (dto.parentId === id) {
            throw new common_1.BadRequestException('父组织不能是自己');
        }
        if (dto.parentId) {
            const descendants = await this.collectDescendantIds(id);
            if (descendants.has(dto.parentId)) {
                throw new common_1.BadRequestException('不能把组织挂到自己的子孙节点下');
            }
            const parent = await this.prisma.organization.findUnique({ where: { id: dto.parentId } });
            if (!parent)
                throw new common_1.BadRequestException(`父组织 ${dto.parentId} 不存在`);
            if (parent.kind !== nextKind) {
                throw new common_1.BadRequestException(`kind=${nextKind} 的组织不能挂到 kind=${parent.kind} 的父节点下`);
            }
        }
        if (dto.code) {
            const dup = await this.prisma.organization.findFirst({
                where: { code: dto.code, NOT: { id } },
            });
            if (dup)
                throw new common_1.ConflictException(`组织编码 ${dto.code} 已被占用`);
        }
        if (dto.name && dto.name !== current.name) {
            const nameDup = await this.prisma.organization.findFirst({
                where: { name: dto.name, kind: nextKind, NOT: { id } },
            });
            if (nameDup) {
                const kindLabel = nextKind === 'party' ? '党组织' : '行政机构';
                throw new common_1.ConflictException(`${kindLabel}内已存在名称 "${dto.name}"`);
            }
        }
        return this.prisma.organization.update({ where: { id }, data: dto });
    }
    async softDelete(id) {
        await this.findOne(id);
        return this.prisma.organization.update({ where: { id }, data: { active: false } });
    }
    async hardDelete(id) {
        await this.findOne(id);
        const childCount = await this.prisma.organization.count({ where: { parentId: id } });
        if (childCount > 0)
            throw new common_1.BadRequestException(`存在 ${childCount} 个子组织,不能直接删除`);
        const memberCount = await this.prisma.userOrganization.count({ where: { orgId: id } });
        if (memberCount > 0)
            throw new common_1.BadRequestException(`组织下还有 ${memberCount} 个成员,不能直接删除`);
        await this.prisma.organization.delete({ where: { id } });
    }
    async collectDescendantIds(rootId) {
        const all = await this.prisma.organization.findMany({ select: { id: true, parentId: true } });
        const childrenMap = new Map();
        all.forEach((o) => {
            if (o.parentId) {
                const arr = childrenMap.get(o.parentId) ?? [];
                arr.push(o.id);
                childrenMap.set(o.parentId, arr);
            }
        });
        const result = new Set();
        const stack = [rootId];
        while (stack.length) {
            const cur = stack.pop();
            const kids = childrenMap.get(cur) ?? [];
            kids.forEach((k) => {
                if (!result.has(k)) {
                    result.add(k);
                    stack.push(k);
                }
            });
        }
        return result;
    }
};
exports.OrganizationService = OrganizationService;
exports.OrganizationService = OrganizationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrganizationService);
//# sourceMappingURL=organization.service.js.map