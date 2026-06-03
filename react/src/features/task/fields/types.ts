import type { ElementType, ReactNode } from "react";
import type { TaskField, TaskFieldType } from "../api";

/**
 * 字段类型「定义契约」—— 每种填报字段(单行文本 / 数字 / 下拉 / 文件 …)实现一份本契约,
 * 集中到 registry。加一个新字段类型 = 新建一个 fields/<type>.tsx + 在 registry 注册一行
 * (+ api.ts 的 TaskFieldType 联合 + 后端 task-fields.ts 的校验规则)。
 *
 * 设计目标(用户诉求):每种字段「独立、自带属性与功能」,便于以后给某一类字段单独加能力,
 * 不用再在 4~5 处 switch 里东改一点西改一点。
 */

export interface FieldPreviewProps {
  field: TaskField;
  /** 'designer' = 设计器卡内所见即所得(默认,较丰富);'form' = 确认/详情的紧凑只读样例 */
  variant?: "designer" | "form";
}

export interface FieldPropsEditorProps {
  field: TaskField;
  /** 局部更新本字段(已绑定 code) */
  patch: (partial: Partial<TaskField>) => void;
}

export interface FieldFillProps {
  field: TaskField;
  /** 当前填报值(formData[code]):按类型为 string / number / {id,name}[] / boolean */
  value: unknown;
  onChange: (v: unknown) => void;
}

export interface FieldTypeDef {
  type: TaskFieldType;
  /** 显示名(palette / 卡片 / 类型下拉) */
  label: string;
  /** lucide 图标组件 */
  icon: ElementType;
  /** palette 与类型下拉里的排序(小在前) */
  order: number;
  /** 新建该类型字段时,除通用属性(code/label/type/required/sortOrder)外要补的默认值 */
  makeDefaults?: () => Partial<TaskField>;
  /** 该类型「自有」属性键 —— 切换类型时只保留这些(通用属性始终保留,不必列) */
  ownProps?: (keyof TaskField)[];
  /** 是否在右栏显示通用「提示 / 占位」行(file/image/doclink 不需要) */
  hasPlaceholder?: boolean;
  /** 所见即所得只读预览(设计器卡 + 确认页样例,按 variant 切换繁简) */
  Preview: (props: FieldPreviewProps) => ReactNode;
  /** 右栏:该类型「专属」属性编辑器;通用的 显示名/必填/占位/说明 不在此(返回 null = 无专属属性) */
  Properties?: (props: FieldPropsEditorProps) => ReactNode;
  /** P2 填报控件(可输入)。返回值写进 TaskSubmission.formData[code];file/image 内部走 storage 上传。 */
  FillInput?: (props: FieldFillProps) => ReactNode;
  /**
   * 设计期校验该字段「定义」是否完整(如下拉缺选项)。返回一句提示文案(用于派发前拦截 + 指引),
   * 完整则返回 null。注意:这里校验「定义」,填报「值」的校验在 P2 做。
   */
  validate?: (field: TaskField) => string | null;
}
