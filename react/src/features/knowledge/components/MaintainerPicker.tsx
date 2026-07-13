import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { usersApi } from "@/features/user";

export interface MaintainerRef {
  userId: string;
  userName: string;
}

/**
 * 维护人员选择器:已选姓名 chips(可移除)+ 搜索用户 Popover 添加。
 * 受控 value/onChange —— 变更由调用方决定何时落库(编辑器里即时调 assignMaintainers)。
 */
export function MaintainerPicker({
  value,
  onChange,
  disabled,
}: {
  value: MaintainerRef[];
  onChange: (next: MaintainerRef[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["users", "maintainer-search", q],
    // directory:通讯录级检索,不受登录人数据范围收敛(维护人可指派任意单位的人)
    queryFn: () => usersApi.directory(q.trim() || undefined, 20),
    enabled: open,
  });
  const selectedIds = new Set(value.map((m) => m.userId));

  function add(u: { id: string; name: string }) {
    if (selectedIds.has(u.id)) return;
    onChange([...value, { userId: u.id, userName: u.name }]);
  }
  function remove(userId: string) {
    onChange(value.filter((m) => m.userId !== userId));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {value.length === 0 && <span className="text-xs text-gray-400">未指派 —— 维护人员可编辑本文、处理反馈</span>}
      {value.map((m) => (
        <span
          key={m.userId}
          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-party-soft text-[var(--party-primary)] text-xs"
        >
          {m.userName}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(m.userId)}
              aria-label={`移除 ${m.userName}`}
              className="hover:bg-white/70 rounded-full p-0.5"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7">
              <UserPlusIcon className="w-3.5 h-3.5 mr-1" /> 添加
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex items-center gap-1.5 border rounded-md px-2 mb-2">
              <SearchIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索姓名 / 工号"
                className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {results.isLoading ? (
                <div className="py-6 text-center text-xs text-gray-400">搜索中…</div>
              ) : (results.data?.items.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">无匹配用户</div>
              ) : (
                results.data!.items.map((u) => {
                  const picked = selectedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={picked}
                      onClick={() => add(u)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${
                        picked ? "opacity-40" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex-1 truncate">{u.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{u.username}</span>
                      {picked && <CheckIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
