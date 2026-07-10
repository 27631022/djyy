import { interactiveFileUrl } from "./api";
import p01 from "./assets/avatars/preset-01.webp";
import p02 from "./assets/avatars/preset-02.webp";
import p03 from "./assets/avatars/preset-03.webp";
import p04 from "./assets/avatars/preset-04.webp";
import p05 from "./assets/avatars/preset-05.webp";
import p06 from "./assets/avatars/preset-06.webp";
import p07 from "./assets/avatars/preset-07.webp";
import p08 from "./assets/avatars/preset-08.webp";
import p09 from "./assets/avatars/preset-09.webp";
import p10 from "./assets/avatars/preset-10.webp";
import p11 from "./assets/avatars/preset-11.webp";

/**
 * 预设头像库(豆包 Seedream 生成的 11 个体育卡通形象,256×256 webp bundle)。
 * 头像标识:"p:<idx>"=预设(idx=数组下标)/ "f:<fileId>"=手机上传(storage)。
 * 后期接员工库:输入员工编码 → 带出 User.avatarUrl(在 avatarUrlOf 加一个 "u:" 前缀分支即可)。
 */
export const PRESET_AVATARS: string[] = [p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11];

/** 头像标识 → 可显示 URL(不认识/为空 → null,调用方回退字母头像) */
export function avatarUrlOf(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("p:")) {
    const idx = Number(avatar.slice(2));
    return Number.isInteger(idx) && idx >= 0 && idx < PRESET_AVATARS.length ? PRESET_AVATARS[idx] : null;
  }
  if (avatar.startsWith("f:")) return interactiveFileUrl(avatar.slice(2));
  return null;
}
