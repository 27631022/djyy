import type { ElementType, ReactNode } from "react";
import type { ShowcaseBlock, ShowcaseBlockType } from "../api";

/**
 * 展示工具契约(与后端 backend/src/showcase/showcase-blocks.ts 的 BLOCK_SPECS 对称)。
 * 每种工具一个文件 tools/<type>.tsx,导出一个 ToolDef;registry.ts 聚合。
 * **加新工具 = 新建 tools/<type>.tsx + registry 注册一行 + api.ts 的 ShowcaseBlockType 补一项
 *   + 后端 BLOCK_SPECS 加一条(normalize + collectFileIds)。**
 */

export interface ToolEditorProps<C> {
  /** 受控 content(与 ShowcaseBlock.content 同构) */
  value: C;
  onChange: (next: C) => void;
  /** 由编辑页注入(绑定 晒台/作品 各自的上传口)—— 工具与 api 解耦,两处复用 */
  upload: (file: File) => Promise<{ fileId: string; name: string }>;
}

export interface ToolDisplayProps<C> {
  value: C;
}

export interface ToolDef<C extends Record<string, unknown> = Record<string, unknown>> {
  type: ShowcaseBlockType;
  /** 中文名(工具面板/区块卡头部) */
  label: string;
  /** lucide 图标 */
  icon: ElementType;
  /** 面板排序 */
  order: number;
  /** 面板一句话说明 */
  description: string;
  /** 新增区块的初始 content */
  makeDefault: () => C;
  /** 作者编辑态(含上传/表格录入) */
  Editor: (p: ToolEditorProps<C>) => ReactNode;
  /** 访客展示态(纯读) */
  Display: (p: ToolDisplayProps<C>) => ReactNode;
  /** 提交前拦截:返回问题文案或 null */
  validate?: (value: C) => string | null;
  /** 从内容里取一张可当封面的图(报送时自动封面用);无图工具不实现 */
  coverOf?: (value: C) => string | undefined;
}

export type { ShowcaseBlock, ShowcaseBlockType };
