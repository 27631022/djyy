import type { ElementType, ReactNode } from "react";
import type { ReportField, ReportFieldType } from "../api";

/**
 * 字段类型「定义契约」—— 每种填报字段(单行文本 / 数字 / 下拉 / 目录点选 / 明细子表 …)
 * 实现一份本契约,集中到 registry。镜像 task/fields(不深 import,守 feature 边界)。
 * 加一个新字段类型 = 新建 fields/<type>.tsx + registry 注册一行 + api.ts 的 ReportFieldType 联合
 *   + 后端 report-fields.ts 的 FIELD_SPECS 加一条。
 */

export interface FieldPreviewProps {
  field: ReportField;
  /** 'designer' = 设计器卡内所见即所得;'form' = 紧凑只读样例 */
  variant?: "designer" | "form";
}

export interface FieldPropsEditorProps {
  field: ReportField;
  /** 局部更新本字段(已绑定 code) */
  patch: (partial: Partial<ReportField>) => void;
}

export interface FieldFillProps {
  field: ReportField;
  /** 当前填报值(按类型:string / number / {id,name}[] / CatalogPickValue / 行数组 …) */
  value: unknown;
  onChange: (v: unknown) => void;
}

export interface FieldTypeDef {
  type: ReportFieldType;
  label: string;
  icon: ElementType;
  order: number;
  /** 新建该类型字段时,除通用属性外要补的默认值 */
  makeDefaults?: () => Partial<ReportField>;
  /** 该类型「自有」属性键 —— 切换类型时只保留这些(通用属性始终保留) */
  ownProps?: (keyof ReportField)[];
  /** 是否在右栏显示通用「提示 / 占位」行 */
  hasPlaceholder?: boolean;
  Preview: (props: FieldPreviewProps) => ReactNode;
  Properties?: (props: FieldPropsEditorProps) => ReactNode;
  /** 填报控件(可输入)。返回值进 ReportSubmission/ReportLine。 */
  FillInput?: (props: FieldFillProps) => ReactNode;
  /** 设计期校验字段「定义」是否完整;返回一句提示文案,完整则 null。 */
  validate?: (field: ReportField) => string | null;
}
