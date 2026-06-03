/**
 * 字段类型实现之间共享的「无 JSX」常量 / 纯函数。
 * (React 组件放在 widgets.tsx —— 拆开是为了满足 react-refresh:本文件不导出组件。)
 */

/** 右栏属性面板里的输入控件外观 */
export const PROP_INPUT =
  "w-full px-2.5 py-1.5 text-[13px] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/** 填报控件外观(可输入,比属性控件大一些) */
export const FILL_INPUT =
  "w-full px-3 py-2 text-sm text-[#172033] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)] focus:ring-2 focus:ring-party-primary-10 placeholder:text-[#9CA3AF]";

/** 设计器卡内的只读控件外观 */
export const DESIGNER_CTL =
  "w-full px-2.5 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white text-[#374151]";

/** 确认/详情页紧凑只读样例外观 */
export const FORM_BOX =
  "w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md bg-[#FCFCFC] text-[#9CA3AF]";

/** 文件字段默认接受类型(PDF / Word / Excel) */
export const DEFAULT_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx";

/** 文件类型多选预设(点选 chip);accept 存逗号分隔的小写扩展名 */
export const FILE_ACCEPT_PRESETS: { label: string; exts: string[] }[] = [
  { label: "PDF", exts: [".pdf"] },
  { label: "Word", exts: [".doc", ".docx"] },
  { label: "Excel", exts: [".xls", ".xlsx"] },
  { label: "PPT", exts: [".ppt", ".pptx"] },
  { label: "图片", exts: [".jpg", ".jpeg", ".png"] },
  { label: "压缩包", exts: [".zip", ".rar"] },
];

/** 上传框「最多个数」文案 */
export function maxFilesLabel(maxFiles?: number): string {
  return maxFiles ? `(最多 ${maxFiles} 个)` : "(不限个数)";
}

/** accept 串 → 友好展示(".pdf,.doc" → "pdf / doc") */
export function acceptLabel(accept?: string): string {
  if (!accept) return "";
  return accept.replace(/\./g, "").replace(/,/g, " / ");
}

/** 上传虚线框样式(两种 variant 略不同) */
export function uploadBoxCls(variant: "designer" | "form"): string {
  return variant === "form"
    ? "w-full py-3 border border-dashed border-[#E9E9E9] rounded-md text-center text-[13px] text-[#9CA3AF]"
    : "border border-dashed border-[#D1D5DB] rounded-md py-3 text-center text-[13px] text-[#9CA3AF]";
}
