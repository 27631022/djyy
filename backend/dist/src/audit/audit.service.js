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
var AuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AuditService = AuditService_1 = class AuditService {
    prisma;
    logger = new common_1.Logger(AuditService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async log(input) {
        try {
            await this.prisma.auditLog.create({
                data: {
                    actorId: input.actorId,
                    actorName: input.actorName,
                    action: input.action,
                    target: input.target,
                    pluginName: input.pluginName,
                    detail: input.detail === undefined ? null : JSON.stringify(input.detail),
                    ip: input.ip,
                },
            });
        }
        catch (err) {
            this.logger.error(`审计日志写入失败 action=${input.action}: ${err.message}`);
        }
    }
    async list(query) {
        const { take = 50, skip = 0, action, actorId, pluginName, since, until } = query;
        const records = await this.prisma.auditLog.findMany({
            where: {
                ...(action ? { action: { contains: action } } : {}),
                ...(actorId ? { actorId } : {}),
                ...(pluginName ? { pluginName } : {}),
                ...(since || until
                    ? {
                        createdAt: {
                            ...(since ? { gte: since } : {}),
                            ...(until ? { lte: until } : {}),
                        },
                    }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(take, 1), 200),
            skip: Math.max(skip, 0),
        });
        const total = await this.prisma.auditLog.count({
            where: {
                ...(action ? { action: { contains: action } } : {}),
                ...(actorId ? { actorId } : {}),
                ...(pluginName ? { pluginName } : {}),
                ...(since || until
                    ? {
                        createdAt: {
                            ...(since ? { gte: since } : {}),
                            ...(until ? { lte: until } : {}),
                        },
                    }
                    : {}),
            },
        });
        return {
            total,
            items: records.map((r) => ({
                ...r,
                detail: r.detail ? safeParse(r.detail) : null,
            })),
        };
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = AuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditService);
function safeParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return s;
    }
}
//# sourceMappingURL=audit.service.js.map