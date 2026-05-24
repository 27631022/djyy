/**
 * AI 提取响应 — 用户上传表彰文件,DeepSeek 抽出来的结构化结果。
 *
 * 前端拿到后:
 *   1. honorName 用来 match 模板的 honorCode(模板编辑时定的中文名 / 代码)
 *   2. yearLabel 预填批次年份
 *   3. recipients[] 自动进批量模式(batchTotal = recipients.length)
 *   4. 用户最终确认/编辑后,逐条调发证 API
 */

export interface ExtractedRecipient {
  name: string;
  empNo?: string;
  dept?: string;
}

export interface ExtractHonorResponse {
  /** 表彰名称(从文件抽取的原始字符串,如 "2024 年度优秀党员") */
  honorName: string;
  /** 年份段,如 "2024" / "2024-2025"(没抽到时给空字符串,前端默认当前年) */
  yearLabel: string;
  /** 表彰对象列表 */
  recipients: ExtractedRecipient[];
  /** 出处元信息 — 用户用来人工核对 */
  source: {
    fileName: string;
    bytes: number;
    /** 解析出的文本字数(给用户看 AI 看到了多少原文) */
    textLength: number;
    /** AI 模型回执 token 用量(可选,DeepSeek 会返) */
    promptTokens?: number;
    completionTokens?: number;
  };
}
