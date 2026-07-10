import { type CSSProperties } from "react";
import { avatarUrlOf } from "../presetAvatars";

/**
 * 玩家头像 —— 有头像(预设/上传)显示图片,否则字母兜底(队色/昵称哈希色由调用方给)。
 * 全平台统一入口:手机个人信息行 / 报名页头像墙 / 领奖台 / 名次圆圈。
 */
export function PlayerAvatar({
  avatar,
  name,
  color,
  className,
  style,
}: {
  avatar?: string | null;
  name: string;
  color: string;
  className?: string;
  style?: CSSProperties;
}) {
  const url = avatarUrlOf(avatar);
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`rounded-full object-cover ${className ?? ""}`}
        style={{ background: "#fff", ...style }}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-black overflow-hidden ${className ?? ""}`}
      style={{ background: color, ...style }}
    >
      {(name || "?").slice(0, 1)}
    </div>
  );
}
