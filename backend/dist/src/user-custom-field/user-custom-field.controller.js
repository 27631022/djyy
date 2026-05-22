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
exports.UserCustomFieldController = void 0;
const common_1 = require("@nestjs/common");
const user_custom_field_service_1 = require("./user-custom-field.service");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const create_custom_field_dto_1 = require("./dto/create-custom-field.dto");
const update_custom_field_dto_1 = require("./dto/update-custom-field.dto");
let UserCustomFieldController = class UserCustomFieldController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(inactive) {
        return this.service.list(inactive === 'true');
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    create(dto, me, req) {
        return this.service.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    update(id, dto, me, req) {
        return this.service.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    remove(id, me, req) {
        return this.service.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
};
exports.UserCustomFieldController = UserCustomFieldController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('inactive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserCustomFieldController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserCustomFieldController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_custom_field_dto_1.CreateCustomFieldDto, Object, Object]),
    __metadata("design:returntype", void 0)
], UserCustomFieldController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_custom_field_dto_1.UpdateCustomFieldDto, Object, Object]),
    __metadata("design:returntype", void 0)
], UserCustomFieldController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], UserCustomFieldController.prototype, "remove", null);
exports.UserCustomFieldController = UserCustomFieldController = __decorate([
    (0, common_1.Controller)('user-custom-fields'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [user_custom_field_service_1.UserCustomFieldService])
], UserCustomFieldController);
//# sourceMappingURL=user-custom-field.controller.js.map