/**
 * 证书编号工具
 * 编号格式:{yearLabel}-{honorCode}-{batchTotal}-{batchSeq3 位}
 *   例:2024-QDJL-100-001 / 2024-2025-YXDY-50-007
 */

/** 把 batchSeq 补 0 到 3 位(超出按位数自然展开) */
export function padSeq(seq: number): string {
  return seq.toString().padStart(3, '0');
}

/** 拼证书编号 */
export function buildCertNo(
  yearLabel: string,
  honorCode: string,
  batchTotal: number,
  batchSeq: number,
): string {
  return `${yearLabel}-${honorCode}-${batchTotal}-${padSeq(batchSeq)}`;
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
