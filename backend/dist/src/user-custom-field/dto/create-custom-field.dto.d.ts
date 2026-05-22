export declare const CUSTOM_FIELD_TYPES: readonly ["text", "number", "date", "textarea", "select"];
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export declare class CreateCustomFieldDto {
    code: string;
    label: string;
    type: CustomFieldType;
    dictCode?: string;
    placeholder?: string;
    description?: string;
    required?: boolean;
    sortOrder?: number;
    active?: boolean;
}
