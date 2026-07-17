import { employeeAvatarUrl, interactiveFileUrl } from "./api";

/**
 * 头像标识 → 可显示 URL(不认识/为空 → null,调用方回退字母头像)。
 * 标识:"f:<fileId>"=手机上传(storage)/ "u:<fileId>"=平台头像
 *      (工牌进场按工号/姓名带出 或 进场页从公共头像库随机候选里点选,与通讯录同一张)。
 * 旧 "p:<idx>" bundle 预设卡通头像已下架(2026-07-16,换头像库随机候选)→ 返回 null 走字母兜底。
 */
export function avatarUrlOf(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("f:")) return interactiveFileUrl(avatar.slice(2));
  if (avatar.startsWith("u:")) return employeeAvatarUrl(avatar.slice(2));
  return null;
}
