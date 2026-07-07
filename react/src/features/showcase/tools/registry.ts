import type { ShowcaseBlock, ShowcaseBlockType } from "../api";
import type { ToolDef } from "./types";
import { storyTool } from "./story";
import { spotTool } from "./spot";
import { compareTool } from "./compare";
import { pano360Tool } from "./pano360";
import { videoTool } from "./video";
import { metricTool } from "./metric";
import { trendTool } from "./trend";
import { timelineTool } from "./timeline";
import { rankingTool } from "./ranking";

/** 全部展示工具(加新工具在此注册一行) */
const ALL = [
  storyTool,
  spotTool,
  compareTool,
  pano360Tool,
  videoTool,
  metricTool,
  trendTool,
  timelineTool,
  rankingTool,
] as unknown as ToolDef[];

export const TOOL_TYPES: Partial<Record<ShowcaseBlockType, ToolDef>> = Object.fromEntries(
  ALL.map((t) => [t.type, t]),
);

/** 按 order 排好(工具面板用) */
export const TOOL_LIST: ToolDef[] = [...ALL].sort((a, b) => a.order - b.order);

/** 取工具定义;未知类型返回 undefined(BlocksRenderer 渲染灰色占位,防脏数据崩) */
export function getTool(type: string): ToolDef | undefined {
  return TOOL_TYPES[type as ShowcaseBlockType];
}

export function toolLabel(type: string): string {
  return getTool(type)?.label ?? type;
}

/** 单块校验:委托工具 validate;未知类型直接报 */
export function validateBlock(block: ShowcaseBlock): string | null {
  const def = getTool(block.type);
  if (!def) return `不支持的工具类型「${block.type}」`;
  return def.validate?.(block.content) ?? null;
}

/** 一组区块里第一个问题(提交前拦截):返回 {index, message} 便于滚动定位 */
export function findBlockIssue(blocks: ShowcaseBlock[]): { index: number; message: string } | null {
  for (let i = 0; i < blocks.length; i++) {
    const msg = validateBlock(blocks[i]);
    if (msg) return { index: i, message: `第 ${i + 1} 块:${msg}` };
  }
  return null;
}

/** 从一组区块里取第一张可当封面的图(报送时自动封面) */
export function deriveCover(blocks: ShowcaseBlock[]): string | undefined {
  for (const b of blocks) {
    const fid = getTool(b.type)?.coverOf?.(b.content);
    if (fid) return fid;
  }
  return undefined;
}
