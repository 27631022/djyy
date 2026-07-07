/** 纯常量/纯函数(无 JSX)—— 工具实现与 widgets 共用 */

/** 数值格式化:千分位 + 小数位 + 单位 */
export function fmtNumber(value: number, decimals = 0, unit?: string | null): string {
  const s = value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${s} ${unit}` : s;
}

/** 新区块 id(浏览器端一次性生成,后端 normalize 会兜底重发) */
export function newBlockId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 编辑器小输入框样式 */
export const TOOL_INPUT =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-party-primary-20";

/** 编辑器上传虚线框样式 */
export const UPLOAD_BOX =
  "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 text-muted-foreground hover:border-[var(--party-primary)]/40 hover:text-[var(--party-primary)] transition-colors cursor-pointer";

/** 奖牌语义色(金/银/铜,不跟主题色) */
export const MEDAL_COLORS = ["#F5A623", "#C0C0C0", "#CD7F32"] as const;

/** 竞争排名(1,2,2,4):同值同名次。输入须已排序;纯函数(渲染期可安全调用)。 */
export function competitionRank<T>(rows: T[], valueOf: (row: T) => number): Array<T & { rank: number }> {
  let prevValue: number | null = null;
  let prevRank = 0;
  return rows.map((row, i) => {
    const v = valueOf(row);
    const rank = prevValue !== null && v === prevValue ? prevRank : i + 1;
    prevValue = v;
    prevRank = rank;
    return { ...row, rank };
  });
}
