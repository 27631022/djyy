import { api } from "@/shared/api/client";

/* ─── 后端 CertificateTemplate 表镜像 ─── */

/**
 * 荣誉等级 — 字典 cert_honor_level 的 code(运行时字符串)。
 * 默认 3 个内置值: company / department / subsidiary,
 * 管理员可在 数据字典 中扩展,本类型保留为 string 表达开放性。
 */
export type HonorLevel = string;

export interface CertificateTemplateDto {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  /** V2 加:荣誉代码,V3+ 必填(发证编号必备) */
  honorCode: string | null;
  /** V3 加:荣誉类型 — individual(个人)/ collective(集体) */
  honorType: "individual" | "collective" | null;
  /** V3 加:荣誉等级 — 字典 cert_honor_level 的 code,默认 company/department/subsidiary */
  honorLevel: string | null;
  /** V3+:落款单位(发证机构),证书印章顶弧文字默认引用 */
  issuingOrgName: string | null;
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
  /** V3+ 必填 */
  honorCode: string;
  /** V3+ 必填 */
  honorType: "individual" | "collective";
  /** V3+ 必填,字典 cert_honor_level 的 code */
  honorLevel: string;
  /** V3+ 必填,落款单位/发证机构 */
  issuingOrgName: string;
  designJson: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  active?: boolean;
}

/**
 * 内置荣誉等级 label 兜底表 — 与 seed.ts cert_honor_level 默认 3 项对齐。
 * 真正的 SoT 在数据字典里;此表用于:
 *   (1) UI 在字典未加载时的即时显示
 *   (2) 字典里有但 label 未自定义时的中文兜底
 * 管理员若在数据字典加新 code,此表无对应 → fallback 显示 code 原文。
 */
export const HONOR_LEVEL_LABEL: Record<string, string> = {
  company: "公司级",
  department: "部门级",
  subsidiary: "分公司级",
};

export const HONOR_TYPE_LABEL = {
  individual: "个人",
  collective: "集体",
} as const;

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
  template: {
    id: string;
    name: string;
    honorCode: string | null;
    /** 荣誉级别(字典 cert_honor_level 的 code)— 取自关联模板,外部证书为 null */
    honorLevel: string | null;
  } | null;
  source: CertificateSource;
  /** 荣誉类型快照:个人 / 集体(外部老数据可能为 null) */
  honorType: "individual" | "collective" | null;
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

export interface IssueExternalCertificateInput {
  honorName: string;
  honorCode: string;
  recipientUserId?: string;
  recipientName: string;
  recipientEmpNo?: string;
  recipientDept?: string;
  recipientIdCard?: string;
  recipientPhone?: string;
  yearLabel: string;
  batchTotal: number;
  externalFileData: string;
  variableData?: string;
  validUntil?: string;
  issuingOrgName?: string;
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
  /** 压缩预览缩略图 JPEG base64(前端从同一次渲染降采样,约几十 KB)。详情轻量预览用 */
  thumbnail?: string;
  validUntil?: string;
  issuingOrgId?: string;
  issuingOrgName?: string;
  /** V3:荣誉类型(个人 / 集体,仅 2 类) */
  honorType?: "individual" | "collective";
  /** V3:颁发日期 ISO YYYY-MM-DD;不传走后端默认 now() */
  issueDate?: string;
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

export interface ExtractedHonor {
  honorName: string;
  issuingOrg?: string;
  /**
   * 荣誉类型(V3 新增):individual / collective(仅 2 类)。
   * 由后端 normalizeHonorType 保证有值 — LLM 直返 > honorName 关键词推断 > 默认 individual。
   * 老 draft 可能没有此字段,前端按 individual 兜底渲染。
   * 老 DB 可能存有 "unit",前端读到时按 collective 处理。
   */
  honorType?: "individual" | "collective";
  recipients: ExtractedRecipient[];
}

export interface ExtractHonorResponse {
  /** 多荣誉:一份文件可能抽到多个(例如"两优一先") */
  honors: ExtractedHonor[];
  yearLabel: string;
  issueDate?: string;
  source: {
    fileName: string;
    bytes: number;
    textLength: number;
    promptTokens?: number;
    completionTokens?: number;
    /** 本次实际用的 provider(如 deepseek / doubao) */
    usedProvider?: string;
    /** 本次实际用的 model */
    usedModel?: string;
    /** 'text'(Word/PDF 走 LLM)或 'vision'(图片走视觉模型) */
    pipeline?: "text" | "vision";
  };
}

export const certificateIssueApi = {
  issue: (input: IssueCertificateInput) =>
    api.post<CertificateDetailDto>("/certificates", input).then((r) => r.data),

  issueExternal: (input: IssueExternalCertificateInput) =>
    api
      .post<CertificateDetailDto>("/certificates/external", input)
      .then((r) => r.data),

  extract: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<ExtractHonorResponse>("/certificates/extract", form, {
        // axios 自己设置 boundary
        headers: { "Content-Type": "multipart/form-data" },
        // AI 提取覆盖默认 15s 超时 —— DeepSeek thinking 模式 + 大 PDF
        // 可能要 30-60s,vision 路径(豆包/千问处理图片)也类似。给 120s 足够稳。
        timeout: 120_000,
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

  /** 轻量缩略图(压缩预览图,不含 pdfData)。详情预览用 —— 几十 KB,秒回 */
  getThumbnail: (id: string) =>
    api
      .get<{ thumbnail: string | null }>(`/certificates/${id}/thumbnail`)
      .then((r) => r.data),

  revoke: (id: string, reason?: string) =>
    api
      .patch<CertificateDetailDto>(`/certificates/${id}/revoke`, { reason })
      .then((r) => r.data),

  /** 物理删除一张证书(管理员专用 — 后端 @Permission('certificate:delete')) */
  remove: (id: string) =>
    api.delete<{ ok: boolean; id: string }>(`/certificates/${id}`).then((r) => r.data),

  /** 批量下载,返回 application/zip 的 Blob */
  bulkDownload: (ids: string[]) =>
    api
      .post<Blob>(
        "/certificates/bulk-download",
        { ids },
        {
          responseType: "blob",
          // 大批量打 ZIP 走默认 15s 可能不够,给 60s
          timeout: 60_000,
        },
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
