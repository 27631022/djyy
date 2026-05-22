"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const health_controller_1 = require("./health/health.controller");
const organization_module_1 = require("./organization/organization.module");
const auth_module_1 = require("./auth/auth.module");
const audit_module_1 = require("./audit/audit.module");
const user_module_1 = require("./user/user.module");
const role_module_1 = require("./role/role.module");
const permission_module_1 = require("./permission/permission.module");
const dictionary_module_1 = require("./dictionary/dictionary.module");
const user_custom_field_module_1 = require("./user-custom-field/user-custom-field.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            audit_module_1.AuditModule,
            organization_module_1.OrganizationModule,
            user_module_1.UserModule,
            role_module_1.RoleModule,
            permission_module_1.PermissionModule,
            dictionary_module_1.DictionaryModule,
            user_custom_field_module_1.UserCustomFieldModule,
        ],
        controllers: [health_controller_1.HealthController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map