/**
 * 证书「变量 ↔ 真实数据」统一映射层。
 *
 * 背景:模板设计器里可以放变量占位符(姓名 / 证书编号 / 颁发日期 ...),
 * 发证 / 预览 / CSV 批量三处都要把这些占位符替换成持证人的真实值。
 * 历史上三处各写一份、且只填了 name/issueDate/department,导致其余变量
 * 永远显示模板里的"示例值"(每张证书都一样)。
 *
 * 这里集中产出**全部预设变量**的值,三处共用,杜绝"这里传了那里没传":
 *  - 有真实数据来源的 → 填真值
 *  - 确实没有数据来源的(职务 / 等级)→ 显式填空串,
 *    这样 injectVariableValues 会用 "" 覆盖示例值,而不是把示例值印到证书上。
 *
 * 注意:本层只产出"渲染到证书上的展示值",不写数据库。
 * 数据库里的日期仍是标准 ISO 格式,只有证书上显示时才转中文大写。
 */

import type { CertificateTemplateDto } from "../api";

/* ─── 中文大写日期 ─── */

const CN_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 年份逐位读:2014 → 二〇一四 */
function yearToChinese(year: number): string {
  return String(year)
    .split("")
    .map((d) => CN_DIGITS[Number(d)] ?? d)
    .join("");
}

/** 1-31 → 中文数字(十 / 二十 / 三十 规则):9→九 10→十 21→二十一 30→三十 31→三十一 */
function smallNumToChinese(n: number): string {
  if (n <= 0 || !Number.isFinite(n)) return String(n);
  if (n < 10) return CN_DIGITS[n];
  if (n === 10) return "十";
  if (n < 20) return `十${CN_DIGITS[n - 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${CN_DIGITS[tens]}十${ones === 0 ? "" : CN_DIGITS[ones]}`;
}

/**
 * ISO 日期串 → 中文大写。
 *   "2014-05-09" → "二〇一四年五月九日"
 *   "2024-10-25" → "二〇二四年十月二十五日"
 * 非法 / 空输入原样返回(不抛异常,渲染不中断)。
 */
export function toChineseUpperDate(iso: string): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso ?? "";
  const y = yearToChinese(Number(m[1]));
  const mo = smallNumToChinese(Number(m[2]));
  const d = smallNumToChinese(Number(m[3]));
  return `${y}年${mo}月${d}日`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/* ─── 变量值映射 ─── */

export interface BuildVariableCtx {
  /** 持证人:个人=姓名+部门,集体=集体名(dept 空) */
  recipient: { name: string; dept?: string };
  /** 所用模板(取 honorCode / issuingOrgName);外部证书无模板时可不传 */
  template?: Pick<CertificateTemplateDto, "honorCode" | "issuingOrgName"> | null;
  /** 表彰年度,如 "2024" / "2024-2025" */
  yearLabel: string;
  /** 颁发日期 ISO;空则用今天 */
  issueDate?: string;
  /** 有效期 ISO;空 = 永久有效 */
  validUntil?: string;
}

/**
 * 产出模板全部预设变量(designerUtils.DEFAULT_VARIABLES 的 key)的展示值。
 *
 * certNo 用占位编号 `{年份}-{荣誉码}-100-001`(前两位动态、后两位写死):
 * 真实编号在发证后由后端按批次生成,显示在「已发证书」列表/详情,
 * 不在前端 PDF 上追求精确(避免编号还没分配就要先渲染的鸡生蛋问题)。
 */
export function buildVariableValues(ctx: BuildVariableCtx): Record<string, string> {
  const honorCode = ctx.template?.honorCode ?? "----";
  const issueIso = ctx.issueDate || todayIso();
  return {
    name: ctx.recipient.name,
    certNo: `${ctx.yearLabel}-${honorCode}-100-001`,
    issueDate: toChineseUpperDate(issueIso),
    validUntil: ctx.validUntil ? toChineseUpperDate(ctx.validUntil) : "永久有效",
    issuer: ctx.template?.issuingOrgName ?? "",
    department: ctx.recipient.dept ?? "",
    // 以下无数据来源 → 空串,确保覆盖模板示例值(不把"党支部书记"/"优秀"印到证书上)
    position: "",
    grade: "",
  };
}
