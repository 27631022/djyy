import { api } from "@/shared/api/client";

/* ─── 后端 CertificateTemplate 表镜像 ─── */
export interface CertificateTemplateDto {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  /** V2 加:荣誉首字母代码,用于发证编号生成 */
  honorCode: string | null;
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
  honorCode?: string;
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

/* ─── 已发证书(V2) ─── */
export type CertificateSource = "internal" | "external";

/** 列表用:不含 pdfData/externalFileData,省传输 */
export interface CertificateListItemDto {
  id: string;
  certNo: string;
  yearLabel: string;
  honorCode: string;
  batchKey: string;
  batchTotal: number;
  batchSeq: number;
  publicToken: string;
  templateId: string | null;
  template: { id: string; name: string; honorCode: string | null } | null;
  source: CertificateSource;
  recipientUserId: string | null;
  recipientName: string;
  recipientEmpNo: string | null;
  recipientDept: string | null;
  variableData: string;
  issueDate: string;
  validUntil: string | null;
  issuedBy: string;
  issuerName: string;
  issuingOrgId: string | null;
  issuingOrgName: string | null;
  revoked: boolean;
  revokedAt: string | null;
  revokedReason: string | null;
  revokedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 详情:列表字段 + pdfData/externalFileData/idCard/phone */
export interface CertificateDetailDto extends CertificateListItemDto {
  recipientIdCard: string | null;
  recipientPhone: string | null;
  pdfData: string | null;
  externalFileData: string | null;
}

export interface IssueCertificateInput {
  templateId: string;
  /** 关联系统用户 — 可选,不传则用手填的 recipientName */
  recipientUserId?: string;
  recipientName: string;
  recipientEmpNo?: string;
  recipientDept?: string;
  recipientIdCard?: string;
  recipientPhone?: string;
  /** "2024" 或 "2024-2025" */
  yearLabel: string;
  /** 本批次总数 */
  batchTotal: number;
  /** 变量值 JSON 串(前端 JSON.stringify) */
  variableData: string;
  /** PDF base64 data URL(前端 jspdf 生成) */
  pdfData: string;
  validUntil?: string;
  issuingOrgId?: string;
  issuingOrgName?: string;
}

export interface CertificateListFilter {
  templateId?: string;
  source?: CertificateSource;
  revoked?: boolean;
  batchKey?: string;
  recipientUserId?: string;
}

export interface ExtractedRecipient {
  name: string;
  empNo?: string;
  dept?: string;
}

export interface ExtractHonorResponse {
  honorName: string;
  yearLabel: string;
  recipients: ExtractedRecipient[];
  source: {
    fileName: string;
    bytes: number;
    textLength: number;
    promptTokens?: number;
    completionTokens?: number;
  };
}

export const certificateIssueApi = {
  issue: (input: IssueCertificateInput) =>
    api.post<CertificateDetailDto>("/certificates", input).then((r) => r.data),

  extract: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<ExtractHonorResponse>("/certificates/extract", form, {
        // axios 自己设置 boundary
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  list: (filter: CertificateListFilter = {}) =>
    api
      .get<CertificateListItemDto[]>("/certificates", {
        params: {
          ...(filter.templateId ? { templateId: filter.templateId } : {}),
          ...(filter.source ? { source: filter.source } : {}),
          ...(filter.revoked !== undefined ? { revoked: String(filter.revoked) } : {}),
          ...(filter.batchKey ? { batchKey: filter.batchKey } : {}),
          ...(filter.recipientUserId ? { recipientUserId: filter.recipientUserId } : {}),
        },
      })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<CertificateDetailDto>(`/certificates/${id}`).then((r) => r.data),

  revoke: (id: string, reason?: string) =>
    api
      .patch<CertificateDetailDto>(`/certificates/${id}/revoke`, { reason })
      .then((r) => r.data),

  /** 批量下载,返回 application/zip 的 Blob */
  bulkDownload: (ids: string[]) =>
    api
      .post<Blob>(
        "/certificates/bulk-download",
        { ids },
        { responseType: "blob" },
      )
      .then((r) => r.data),
};

/* ─── 公开验证(无需登录;同样形态留给未来"首页综合查询"复用) ─── */

/** 公开搜索结果:沿用列表 DTO 但 pdfData/敏感字段已脱敏成 null */
export type CertificatePublicListItem = CertificateListItemDto;

/** 公开验证详情:含 pdfData(给公开页渲染),idCard/phone/externalFileData 脱敏 */
export type CertificatePublicDetail = CertificateDetailDto;

export const certificatePublicApi = {
  search: (q: string) =>
    api
      .get<CertificatePublicListItem[]>("/public/certificates/search", {
        params: { q },
      })
      .then((r) => r.data),

  verifyByToken: (token: string) =>
    api
      .get<CertificatePublicDetail>(`/public/certificates/verify/${token}`)
      .then((r) => r.data),
};
