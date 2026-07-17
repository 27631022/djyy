import { useState, type ReactNode } from "react";
import { AvatarGenerator } from "./AvatarGenerator";
import { AvatarLibraryPicker } from "./AvatarLibraryPicker";
import type { AvatarGender } from "../api";

/**
 * 统一的「更换头像」面板:从公共头像库挑现成(默认,最快)/ 上传照片 AI 生成个性头像,
 * 两条路都走同一 onConfirm(url) 落库。个人设置与后台用户管理共用,保持体验一致。
 */
export function AvatarChanger({
  onConfirm,
  confirmLabel = "设为头像",
  targetName,
  employeeNumber,
  defaultGender,
}: {
  onConfirm: (url: string) => void;
  confirmLabel?: string;
  targetName?: string;
  employeeNumber?: string;
  defaultGender?: AvatarGender;
}) {
  const [tab, setTab] = useState<"library" | "generate">("library");
  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        <TabBtn active={tab === "library"} onClick={() => setTab("library")}>
          从头像库选择
        </TabBtn>
        <TabBtn active={tab === "generate"} onClick={() => setTab("generate")}>
          AI 生成
        </TabBtn>
      </div>
      {tab === "library" ? (
        <AvatarLibraryPicker onConfirm={onConfirm} defaultGender={defaultGender} />
      ) : (
        <AvatarGenerator
          targetName={targetName}
          employeeNumber={employeeNumber}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-[var(--party-primary)] bg-party-soft font-medium text-[var(--party-primary)]"
          : "border-gray-200 text-gray-500 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
