/** 计分工具参数编辑器共享样式 / 小工具 */

export const PROP_INPUT =
  "w-full px-2.5 py-1.5 text-[13px] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

export const num = (v: unknown, d = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** 从 params 读数值(可空) */
export function pickNum(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** 从 params 读对象数组(tiers 等) */
export function pickRows(params: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = params[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
}
