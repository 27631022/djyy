/** 单文件上限(字节)。证书 ×3 超采样 PDF 约十几 MB,留足头;任务附件同此闸。 */
export const FILE_MAX_BYTES = 30 * 1024 * 1024; // 30 MB

/**
 * 允许的扩展名(小写无点)→ 规范 mime。
 * 以「扩展名」为主闸 —— 客户端 mimetype 可伪造,扩展名 + 后续魔数(增强项)更可靠。
 * 需要新格式直接往这里加。
 */
export const ALLOWED_EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
};
