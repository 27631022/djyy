/** 默认单文件上限(字节)。证书 ×3 超采样 PDF 约十几 MB,留足头;任务附件同此闸。 */
export const FILE_MAX_BYTES = 30 * 1024 * 1024; // 30 MB

/**
 * 大文件类型的专属上限(字节)—— 视频/3D 模型天生大,默认 30MB 闸必拦,
 * 按扩展名放宽(用户实测:展厅宣传片 mp4 直接 400)。其余类型仍走 FILE_MAX_BYTES。
 */
export const EXT_MAX_BYTES: Record<string, number> = {
  mp4: 300 * 1024 * 1024, // 300 MB:展厅宣传片
  webm: 300 * 1024 * 1024,
  glb: 100 * 1024 * 1024, // 100 MB:Seed3D 产物/手动模型
  gltf: 100 * 1024 * 1024,
};

/** 某扩展名的实际上限 */
export function maxBytesForExt(ext: string | undefined): number {
  return (ext && EXT_MAX_BYTES[ext.toLowerCase()]) || FILE_MAX_BYTES;
}

/**
 * 允许的扩展名(小写无点)→ 规范 mime。
 * 以「扩展名」为主闸 —— 客户端 mimetype 可伪造,扩展名 + 后续魔数(增强项)更可靠。
 * 需要新格式直接往这里加(超 30MB 的同时在 EXT_MAX_BYTES 配上限)。
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
  // 3D 模型(Seed3D 生成 / 3D 展厅用)
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  // 视频(3D 展厅视频展墙)
  mp4: 'video/mp4',
  webm: 'video/webm',
};
