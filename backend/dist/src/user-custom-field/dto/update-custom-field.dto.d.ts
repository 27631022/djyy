import { CustomFieldType } from './create-custom-field.dto';
export declare class UpdateCustomFieldDto {
    label?: string;
    type?: CustomFieldType;
    dictCode?: string | null;
    placeholder?: string;
    description?: string;
    required?: boolean;
    sortOrder?: number;
    active?: boolean;
}
