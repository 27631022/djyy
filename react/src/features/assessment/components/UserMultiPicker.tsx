import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Loader2 } from "lucide-react";
import { usersApi } from "@/features/user";
import { PROP_INPUT } from "../scoring/shared";

/**
 * 全员搜索多选 user picker(协同维护人 / 节点管理员用)。
 * value = userId[];选中即把姓名回灌 onResolveNames 供重载后展示;已选 chips 用 nameMap 显示姓名。
 */
export function UserMultiPicker({
  value,
  onChange,
  nameMap = {},
  onResolveNames,
  placeholder = "搜索姓名 / 员工编号 添加…",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  nameMap?: Record<string, string>;
  onResolveNames?: (entries: Record<string, string>) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const term = search.trim();

  const { data, isFetching } = useQuery({
    queryKey: ["user-search", term],
    queryFn: () => usersApi.list({ search: term, take: 20, active: true }),
    enabled: term.length >= 1,
    staleTime: 30_000,
  });

  const results = useMemo(
    () => (data?.items ?? []).filter((u) => !value.includes(u.id)),
    [data, value],
  );

  function add(u: { id: string; name: string; username: string }) {
    if (value.includes(u.id)) return;
    onChange([...value, u.id]);
    onResolveNames?.({ [u.id]: u.name });
    setSearch("");
  }

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[12px] bg-party-soft text-[var(--party-primary)]"
            >
              {nameMap[id] ?? id}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== id))}
                className="p-0.5 rounded-full hover:bg-[var(--party-primary)]/15"
                title="移除"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`${PROP_INPUT} pl-7 w-full`}
        />
        {isFetching && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
        )}
        {open && term.length >= 1 && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-auto rounded-md border border-[#dce4ef] bg-white shadow-lg">
            {results.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[#9CA3AF]">{isFetching ? "搜索中…" : "无匹配用户"}</div>
            ) : (
              results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(u)}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-[#172033] hover:bg-party-soft flex items-center justify-between gap-2"
                >
                  <span className="truncate">{u.name}</span>
                  <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{u.username}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 节点管理员字段(分支/叶子通用):可见并维护本节点(及其子树)。 */
export function NodeAdminField({
  value,
  onChange,
  nameMap,
  onResolveNames,
  hasChildren,
}: {
  value: string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
  nameMap?: Record<string, string>;
  onResolveNames?: (entries: Record<string, string>) => void;
  hasChildren: boolean;
}) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-[#172033] mb-2">指标管理员</div>
      <UserMultiPicker
        value={value ?? []}
        onChange={(ids) => onChange(ids.length ? ids : undefined)}
        nameMap={nameMap}
        onResolveNames={onResolveNames}
        placeholder="搜索姓名 / 员工编号 指派管理员…"
      />
      <div className="mt-1 text-[11px] text-[#9CA3AF]">
        {hasChildren ? "可见并维护本指标及其下全部子指标。" : "可见并维护本指标。"}
      </div>
    </div>
  );
}
