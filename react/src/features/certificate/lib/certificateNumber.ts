/**
 * 证书编号工具
 * 编号格式:{yearLabel}-{honorCode}-{batchTotal3 位}-{batchSeq3 位}
 *   例:2024-QDJL-100-001 / 2024-2025-YXDY-050-007
 */

/** 补 0 到 3 位(超出按位数自然展开)。总数段、序号段都用它 */
export function padSeq(seq: number): string {
  return seq.toString().padStart(3, '0');
}

/** 拼证书编号 — 与后端 issue.service.ts buildCertNo 保持一致(总数、序号都补 3 位) */
export function buildCertNo(
  yearLabel: string,
  honorCode: string,
  batchTotal: number,
  batchSeq: number,
): string {
  return `${yearLabel}-${honorCode}-${padSeq(batchTotal)}-${padSeq(batchSeq)}`;
}

/** 默认下载文件名:{荣誉名/honorCode}-{姓名}-{员工编号}.pdf */
export function buildPdfFileName(opts: {
  honorName?: string;
  honorCode?: string;
  recipientName: string;
  recipientEmpNo?: string | null;
}): string {
  const honor = (opts.honorName || opts.honorCode || '证书').trim();
  const parts = [honor, opts.recipientName.trim()];
  if (opts.recipientEmpNo) parts.push(opts.recipientEmpNo.trim());
  // 把可能的非法文件名字符替换掉
  const safe = parts.map((p) => p.replace(/[\\/:*?"<>|]/g, '_')).join('-');
  return `${safe}.pdf`;
}

/** 校验 yearLabel 格式 */
export function isValidYearLabel(s: string): boolean {
  return /^\d{4}(-\d{4})?$/.test(s);
}
