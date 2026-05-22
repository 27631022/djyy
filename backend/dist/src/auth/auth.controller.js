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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_guard_1 = require("./auth.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const dev_login_dto_1 = require("./dto/dev-login.dto");
const audit_service_1 = require("../audit/audit.service");
let AuthController = class AuthController {
    auth;
    prisma;
    audit;
    constructor(auth, prisma, audit) {
        this.auth = auth;
        this.prisma = prisma;
        this.audit = audit;
    }
    async devLogin(dto, req) {
        const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
        if (!user || !user.active) {
            throw new common_1.UnauthorizedException('用户不存在或已禁用');
        }
        const token = this.auth.signToken({
            sub: user.id,
            username: user.username,
            name: user.name,
        });
        await this.audit.log({
            actorId: user.id,
            actorName: user.name,
            action: 'auth.dev_login',
            ip: req.ip,
        });
        return {
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
            },
        };
    }
    async me(current) {
        if (!current)
            throw new common_1.UnauthorizedException();
        const user = await this.prisma.user.findUnique({
            where: { id: current.sub },
            include: {
                memberships: {
                    include: { org: true },
                    orderBy: [{ isPrimary: 'desc' }],
                },
                roles: {
                    include: {
                        role: true,
                        scopeOrgs: { include: { org: true } },
                    },
                },
            },
        });
        if (!user)
            throw new common_1.UnauthorizedException();
        const adminMemberships = user.memberships.filter((m) => m.org.kind === 'admin');
        const partyMemberships = user.memberships.filter((m) => m.org.kind === 'party');
        return {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            active: user.active,
            memberships: {
                admin: adminMemberships,
                party: partyMemberships,
            },
            roles: user.roles.map((r) => ({
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
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('dev-login'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dev_login_dto_1.DevLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "devLogin", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map