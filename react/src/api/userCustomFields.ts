import { api } from "./client";

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "textarea", "select"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text:     "单行文本",
  number:   "数字",
  date:     "日期",
  textarea: "多行文本",
  select:   "字典下拉",
};

export interface UserCustomField {
  id: string;
  code: string;
  label: string;
  type: CustomFieldType;
  dictCode: string | null;
  placeholder: string | null;
  description: string | null;
  required: boolean;
  sortOrder: number;
  active: boolean;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomFieldInput {
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

export interface UpdateCustomFieldInput {
  label?: string;
  type?: CustomFieldType;
  dictCode?: string | null;
  placeholder?: string;
  description?: string;
  required?: boolean;
  sortOrder?: number;
  active?: boolean;
}

export const userCustomFieldsApi = {
  list: (includeInactive = true) =>
    api.get<UserCustomField[]>("/user-custom-fields", { params: includeInactive ? { inactive: "true" } : {} }).then((r) => r.data),

  create: (input: CreateCustomFieldInput) =>
    api.post<UserCustomField>("/user-custom-fields", input).then((r) => r.data),

  update: (id: string, input: UpdateCustomFieldInput) =>
    api.patch<UserCustomField>(`/user-custom-fields/${id}`, input).then((r) => r.data),

  remove: (id: string) => api.delete(`/user-custom-fields/${id}`).then((r) => r.data),
};
