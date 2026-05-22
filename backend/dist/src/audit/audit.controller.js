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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("./audit.service");
const auth_guard_1 = require("../auth/auth.guard");
let AuditController = class AuditController {
    audit;
    constructor(audit) {
        this.audit = audit;
    }
    list(take, skip, action, actorId, pluginName, since, until) {
        return this.audit.list({
            take: take ? parseInt(take, 10) || 50 : 50,
            skip: skip ? parseInt(skip, 10) || 0 : 0,
            action: action?.trim() || undefined,
            actorId: actorId?.trim() || undefined,
            pluginName: pluginName?.trim() || undefined,
            since: since ? new Date(since) : undefined,
            until: until ? new Date(until) : undefined,
        });
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('take')),
    __param(1, (0, common_1.Query)('skip')),
    __param(2, (0, common_1.Query)('action')),
    __param(3, (0, common_1.Query)('actorId')),
    __param(4, (0, common_1.Query)('pluginName')),
    __param(5, (0, common_1.Query)('since')),
    __param(6, (0, common_1.Query)('until')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], AuditController.prototype, "list", null);
exports.AuditController = AuditController = __decorate([
    (0, common_1.Controller)('audit'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map