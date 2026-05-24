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

/**
 * 一个荣誉项 — 一份表彰文件可能包含多个(如"两优一先":
 * 优秀共产党员 / 优秀党务工作者 / 先进基层党组织)。
 */
export interface ExtractedHonor {
  /** 荣誉名称,如 "优秀共产党员" */
  honorName: string;
  /** 该荣誉的颁发机构(若文中能抽到,如 "中共 XX 委员会") */
  issuingOrg?: string;
  /** 表彰对象列表 */
  recipients: ExtractedRecipient[];
}

export interface ExtractHonorResponse {
  /** 多荣誉:一份文件抽到的所有荣誉项。单荣誉时 length=1。 */
  honors: ExtractedHonor[];
  /** 年份段(整份文件级别),如 "2024" / "2024-2025"(抽不到时空字符串) */
  yearLabel: string;
  /** 颁发日期(整份文件级别),ISO 字符串 yyyy-mm-dd 或空 */
  issueDate?: string;
  /** 出处元信息 — 用户用来人工核对 */
  source: {
    fileName: string;
    bytes: number;
    /** 解析出的文本字数(给用户看 AI 看到了多少原文)。图片识别时为 0 */
    textLength: number;
    /** AI 模型回执 token 用量(可选) */
    promptTokens?: number;
    completionTokens?: number;
    /** 本次实际用的 provider(如 deepseek / doubao) */
    usedProvider?: string;
    /** 本次实际用的 model(如 deepseek-v4-flash / doubao-1.5-vision-pro-32k) */
    usedModel?: string;
    /** 'text'(Word/PDF 走 LLM)或 'vision'(图片走视觉模型) */
    pipeline?: 'text' | 'vision';
  };
}
