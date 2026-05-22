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
exports.UserController = void 0;
const common_1 = require("@nestjs/common");
const user_service_1 = require("./user.service");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const create_user_dto_1 = require("./dto/create-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const replace_memberships_dto_1 = require("./dto/replace-memberships.dto");
const replace_roles_dto_1 = require("./dto/replace-roles.dto");
const list_users_query_1 = require("./dto/list-users.query");
let UserController = class UserController {
    users;
    constructor(users) {
        this.users = users;
    }
    list(query) {
        return this.users.list(query);
    }
    findOne(id) {
        return this.users.findOne(id);
    }
    create(dto, me, req) {
        return this.users.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    update(id, dto, me, req) {
        return this.users.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    replaceMemberships(id, dto, me, req) {
        return this.users.replaceMemberships(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    replaceRoles(id, dto, me, req) {
        return this.users.replaceRoles(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    replaceCustomFields(id, body, me, req) {
        return this.users.replaceCustomFields(id, body?.values ?? {}, {
            actorId: me.sub,
            actorName: me.name,
            ip: req.ip,
        });
    }
    remove(id, me, req) {
        return this.users.softDelete(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_users_query_1.ListUsersQuery]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto, Object, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto, Object, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':id/memberships'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, replace_memberships_dto_1.ReplaceMembershipsDto, Object, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "replaceMemberships", null);
__decorate([
    (0, common_1.Put)(':id/roles'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, replace_roles_dto_1.ReplaceRolesDto, Object, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "replaceRoles", null);
__decorate([
    (0, common_1.Put)(':id/custom-fields'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "replaceCustomFields", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "remove", null);
exports.UserController = UserController = __decorate([
    (0, common_1.Controller)('users'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [user_service_1.UserService])
], UserController);
//# sourceMappingURL=user.controller.js.map