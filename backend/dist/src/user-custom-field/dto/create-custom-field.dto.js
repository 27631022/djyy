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
exports.CreateCustomFieldDto = exports.CUSTOM_FIELD_TYPES = void 0;
const class_validator_1 = require("class-validator");
exports.CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'textarea', 'select'];
class CreateCustomFieldDto {
    code;
    label;
    type;
    dictCode;
    placeholder;
    description;
    required;
    sortOrder;
    active;
}
exports.CreateCustomFieldDto = CreateCustomFieldDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(60),
    (0, class_validator_1.Matches)(/^[a-z][a-z0-9_]*$/, { message: 'code 仅允许小写字母数字下划线,首位字母' }),
    __metadata("design:type", String)
], CreateCustomFieldDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], CreateCustomFieldDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsIn)(exports.CUSTOM_FIELD_TYPES),
    __metadata("design:type", String)
], CreateCustomFieldDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.type === 'select'),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], CreateCustomFieldDto.prototype, "dictCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateCustomFieldDto.prototype, "placeholder", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateCustomFieldDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateCustomFieldDto.prototype, "required", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateCustomFieldDto.prototype, "sortOrder", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateCustomFieldDto.prototype, "active", void 0);
//# sourceMappingURL=create-custom-field.dto.js.map