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
exports.OrganizationController = void 0;
const common_1 = require("@nestjs/common");
const organization_service_1 = require("./organization.service");
const create_organization_dto_1 = require("./dto/create-organization.dto");
const update_organization_dto_1 = require("./dto/update-organization.dto");
let OrganizationController = class OrganizationController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(kind, inactive) {
        return this.service.findAll({
            kind: kind === 'party' || kind === 'admin' ? kind : undefined,
            includeInactive: inactive === 'true',
        });
    }
    tree(kind, inactive) {
        return this.service.findTree({
            kind: kind === 'party' || kind === 'admin' ? kind : undefined,
            includeInactive: inactive === 'true',
        });
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    members(id, recursive) {
        return this.service.listMembers(id, recursive === 'true');
    }
    create(dto) {
        return this.service.create(dto);
    }
    update(id, dto) {
        return this.service.update(id, dto);
    }
    move(id, body) {
        return this.service.move(id, body.targetId, body.position);
    }
    async remove(id, hard) {
        if (hard === 'true') {
            await this.service.hardDelete(id);
        }
        else {
            await this.service.softDelete(id);
        }
    }
};
exports.OrganizationController = OrganizationController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('kind')),
    __param(1, (0, common_1.Query)('inactive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('tree'),
    __param(0, (0, common_1.Query)('kind')),
    __param(1, (0, common_1.Query)('inactive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "tree", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/members'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('recursive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "members", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_organization_dto_1.CreateOrganizationDto]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_organization_dto_1.UpdateOrganizationDto]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/move'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "move", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('hard')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "remove", null);
exports.OrganizationController = OrganizationController = __decorate([
    (0, common_1.Controller)('organizations'),
    __metadata("design:paramtypes", [organization_service_1.OrganizationService])
], OrganizationController);
//# sourceMappingURL=organization.controller.js.map