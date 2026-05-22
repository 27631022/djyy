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
exports.DictionaryController = void 0;
const common_1 = require("@nestjs/common");
const dictionary_service_1 = require("./dictionary.service");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const create_dictionary_dto_1 = require("./dto/create-dictionary.dto");
const update_dictionary_dto_1 = require("./dto/update-dictionary.dto");
const create_dict_item_dto_1 = require("./dto/create-dict-item.dto");
const update_dict_item_dto_1 = require("./dto/update-dict-item.dto");
let DictionaryController = class DictionaryController {
    dicts;
    constructor(dicts) {
        this.dicts = dicts;
    }
    list(inactive) {
        return this.dicts.listDictionaries(inactive === 'true');
    }
    findOne(idOrCode, inactive) {
        return this.dicts.findDictionary(idOrCode, inactive === 'true');
    }
    create(dto, me, req) {
        return this.dicts.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    update(id, dto, me, req) {
        return this.dicts.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    remove(id, me, req) {
        return this.dicts.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    createItem(id, dto, me, req) {
        return this.dicts.createItem(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    updateItem(id, itemId, dto, me, req) {
        return this.dicts.updateItem(id, itemId, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
    removeItem(id, itemId, me, req) {
        return this.dicts.removeItem(id, itemId, { actorId: me.sub, actorName: me.name, ip: req.ip });
    }
};
exports.DictionaryController = DictionaryController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('inactive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':idOrCode'),
    __param(0, (0, common_1.Param)('idOrCode')),
    __param(1, (0, common_1.Query)('inactive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_dictionary_dto_1.CreateDictionaryDto, Object, Object]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_dictionary_dto_1.UpdateDictionaryDto, Object, Object]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/items'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_dict_item_dto_1.CreateDictItemDto, Object, Object]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "createItem", null);
__decorate([
    (0, common_1.Patch)(':id/items/:itemId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('itemId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_dict_item_dto_1.UpdateDictItemDto, Object, Object]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)(':id/items/:itemId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('itemId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], DictionaryController.prototype, "removeItem", null);
exports.DictionaryController = DictionaryController = __decorate([
    (0, common_1.Controller)('dictionaries'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [dictionary_service_1.DictionaryService])
], DictionaryController);
//# sourceMappingURL=dictionary.controller.js.map