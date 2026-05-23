import { api } from "@/shared/api/client";

/* ─── 后端 CertificateTemplate 表镜像 ─── */
export interface CertificateTemplateDto {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  /** DesignerState 序列化的 JSON 字符串。前端用前先 JSON.parse */
  designJson: string;
  thumbnail: string | null;
  width: number;
  height: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  designJson: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  active?: boolean;
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

export const certificateTemplateApi = {
  list: (active?: boolean) =>
    api
      .get<CertificateTemplateDto[]>("/certificate-templates", {
        params: active === undefined ? undefined : { active },
      })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<CertificateTemplateDto>(`/certificate-templates/${id}`).then((r) => r.data),

  create: (input: CreateTemplateInput) =>
    api.post<CertificateTemplateDto>("/certificate-templates", input).then((r) => r.data),

  update: (id: string, input: UpdateTemplateInput) =>
    api.patch<CertificateTemplateDto>(`/certificate-templates/${id}`, input).then((r) => r.data),

  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/certificate-templates/${id}`).then((r) => r.data),
};
