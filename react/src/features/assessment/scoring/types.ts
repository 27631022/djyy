import type { ElementType, ReactNode } from "react";

/** 计分工具吃的「原始度量」类型(↔ 数据源 outputType) */
export type ScoreInput = "rate" | "number" | "bool" | "count";

export interface StrategyPropsEditorProps {
  params: Record<string, unknown>;
  /** 局部合并参数 */
  patch: (partial: Record<string, unknown>) => void;
}

/**
 * 计分工具定义(前端注册表项,照 task/fields 的 FieldTypeDef 范式)。
 * 不含 compute —— 试算由后端 /assessment/scoring/trial 权威计算,前端不重复实现公式。
 */
export interface ScoringStrategyDef {
  type: string;
  label: string;
  icon: ElementType;
  order: number;
  inputType: ScoreInput;
  /** 是否需要全体对象数据(排名/标准化) */
  crossTarget: boolean;
  /** 新建时默认参数 */
  makeDefaults?: () => Record<string, unknown>;
  /** 右栏:该工具专属参数编辑器 */
  Properties?: (p: StrategyPropsEditorProps) => ReactNode;
  /** 规则摘要(一句话,展示用) */
  summary?: (params: Record<string, unknown>) => string;
  /** 参数完整性校验(返回提示文案;完整返回 null) */
  validate?: (params: Record<string, unknown>) => string | null;
}
