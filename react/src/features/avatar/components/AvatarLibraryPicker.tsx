import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { avatarLibraryApi, resolveAvatarUrl, type AvatarGender } from "../api";

const GENDER_TABS: { key: "" | AvatarGender; label: string }[] = [
  { key: "", label: "全部" },
  { key: "male", label: "男" },
  { key: "female", label: "女" },
  { key: "neutral", label: "通用" },
];

/**
 * 从公共头像库挑选头像(个人设置「更换头像」+ 后台用户管理都可复用)。
 * 默认按传入性别筛选(个人设置传当前用户性别),可切性别 tab;点选缩略图 → onConfirm(该头像公开 URL)。
 * 缩略图走 thumbUrl(网格省流量),落库的是原图 url。
 */
export function AvatarLibraryPicker({
  onConfirm,
  defaultGender,
}: {
  onConfirm: (url: string) => void;
  defaultGender?: AvatarGender;
}) {
  const [gender, setGender] = useState<"" | AvatarGender>(defaultGender ?? "");
  const listQ = useQuery({
    queryKey: ["avatar-library", "picker", gender],
    queryFn: () => avatarLibraryApi.list({ gender: gender || undefined }),
  });
  const items = listQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {GENDER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setGender(t.key)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              gender === t.key
                ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-medium"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">共 {items.length} 个</span>
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <Loader2Icon className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-xs text-slate-400">
          该分类下暂无头像
        </div>
      ) : (
        <div className="grid max-h-[280px] grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 overflow-y-auto pr-1">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onConfirm(it.url)}
              title={`${it.name} · 点选设为头像`}
              className="aspect-square overflow-hidden rounded-lg ring-1 ring-slate-200 transition-shadow hover:ring-2 hover:ring-[var(--party-primary)]"
            >
              <img
                src={resolveAvatarUrl(it.thumbUrl)}
                alt={it.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
