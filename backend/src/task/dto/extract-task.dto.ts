import type { TaskField } from '../task-fields';

/**
 * 任务 AI 识别返回结构(POST /tasks/extract)。
 * 不持久化,前端拿来预填「新建任务」第一步表单 + 第二步建议字段 + 第三步建议范围,
 * 人工确认后才派发。
 */
export interface TaskExtractResponse {
  /** 任务名称(提炼,不带公文套话) */
  title: string;
  /** 填报要求(要报什么 / 口径 / 时间节点等),可空 */
  requirements: string;
  /** 报送截止日期 ISO(YYYY-MM-DD),抽不到为空串 */
  dueDate: string;
  /** 按填报要求初步生成的填报字段(用户在第二步可改) */
  fields: TaskField[];
  /** 建议填报范围层级:'level1'|'level2'|'level3'|'level4'|'' */
  scopeHint: string;
  /** 从文件抬头/正文识别到的建议填报单位名(前端做名称匹配预选) */
  suggestedUnits: string[];
  source: {
    fileName: string;
    bytes: number;
    textLength: number;
    promptTokens?: number;
    completionTokens?: number;
    usedProvider?: string;
    usedModel?: string;
  };
}

/** 仅按填报要求文本生成字段(POST /tasks/suggest-fields) */
export interface SuggestFieldsResponse {
  fields: TaskField[];
  source: {
    usedProvider?: string;
    usedModel?: string;
    promptTokens?: number;
    completionTokens?: number;
  };
}
