/**
 * 浏览器下载工具 —— 统一「Blob → object URL → <a download> → 延迟 revoke」。
 *
 * 关键:`revokeObjectURL` 必须**延迟**(setTimeout),不能在 `click()` 后立即同步释放。
 * 立即 revoke 会和下载抢跑:blob 在浏览器真正读取前就被释放,浏览器转而去「加载」一个失效
 * 的 blob URL —— 在 HTTP 局域网(非 HTTPS)下表现为控制台
 * 「The file at 'blob:http://…' was loaded over an insecure connection」警告 + 下载失败/无文件。
 * 证书下载(certificatePdf.triggerDownload)已用此写法,这里抽成通用工具复用。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 给下载留出读取 blob 的时间再释放(不可同步 revoke)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
