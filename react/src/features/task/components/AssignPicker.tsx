import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlusIcon, SearchIcon, UserIcon, Loader2Icon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { usersApi } from "@/features/user";

/**
 * 指派承办人选择器(承办部门负责人侧)—— Popover:搜索框 + 本部门成员列表,点一人即指派。
 * 成员从承办部门(assignOrgId)拉取,与后端校验「承办人必须是该部门成员」一致。
 */
export function AssignPicker({
  orgId,
  orgName,
  busy,
  onPick,
}: {
  orgId: string;
  orgName: string | null;
  busy?: boolean;
  onPick: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const membersQ = useQuery({
    queryKey: ["assign-members", orgId],
    queryFn: () => usersApi.list({ adminOrgIds: [orgId], take: 100, active: true }),
    enabled: open,
  });
  const items = membersQ.data?.items ?? [];
  const kw = q.trim().toLowerCase();
  const filtered = kw
    ? items.filter(
        (u) => u.name.toLowerCase().includes(kw) || u.username.toLowerCase().includes(kw),
      )
    : items;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
        >
          <UserPlusIcon className="w-4 h-4" />
          指派
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-[#eef2f7] bg-[#FBFCFE]">
          <div className="text-[12px] text-[#475467]">
            指派给 <span className="font-semibold">{orgName ?? "本部门"}</span> 成员
          </div>
        </div>
        <div className="p-2 border-b border-[#eef2f7]">
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名 / 工号…"
              className="w-full pl-8 pr-2 py-2 text-[13px] border border-[#dce4ef] rounded-lg focus:outline-none focus:border-[var(--party-primary)]"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto p-1">
          {membersQ.isLoading ? (
            <div className="text-[13px] text-[#9CA3AF] text-center py-6 inline-flex items-center justify-center gap-1.5 w-full">
              <Loader2Icon className="w-4 h-4 animate-spin" />
              加载成员…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-[13px] text-[#9CA3AF] text-center py-6">
              {items.length === 0 ? "本部门暂无可指派成员" : "无匹配成员"}
            </div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onPick(u.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-party-soft"
              >
                <span className="w-7 h-7 rounded-full grid place-items-center bg-[#EEF2F7] flex-shrink-0">
                  <UserIcon className="w-3.5 h-3.5 text-[#6B7280]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-[#172033] truncate">{u.name}</span>
                  <span className="block text-[11px] text-[#9CA3AF] truncate">{u.username}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
