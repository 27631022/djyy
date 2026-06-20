import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlusIcon, SearchIcon, UserIcon, Loader2Icon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { usersApi } from "@/features/user";

/** 指派承办人选择器(承办部门成员)——镜像 task AssignPicker。点一人即指派。 */
export function ReportAssignPicker({
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
    queryKey: ["report-assign-members", orgId],
    queryFn: () => usersApi.list({ adminOrgIds: [orgId], take: 100, active: true }),
    enabled: open,
  });
  const items = membersQ.data?.items ?? [];
  const kw = q.trim().toLowerCase();
  const filtered = kw
    ? items.filter((u) => u.name.toLowerCase().includes(kw) || u.username.toLowerCase().includes(kw))
    : items;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce4ef] bg-white px-3.5 py-2 text-[13px] font-bold text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
        >
          <UserPlusIcon className="h-4 w-4" />
          指派
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 overflow-hidden p-0">
        <div className="border-b border-[#eef2f7] bg-[#FBFCFE] px-3 py-2 text-[12px] text-[#475467]">
          指派给 <span className="font-semibold">{orgName ?? "本部门"}</span> 成员
        </div>
        <div className="border-b border-[#eef2f7] p-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名 / 工号…"
              className="w-full rounded-lg border border-[#dce4ef] py-2 pl-8 pr-2 text-[13px] focus:border-[var(--party-primary)] focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto p-1">
          {membersQ.isLoading ? (
            <div className="inline-flex w-full items-center justify-center gap-1.5 py-6 text-center text-[13px] text-[#9CA3AF]">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              加载成员…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#9CA3AF]">
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
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-party-soft"
              >
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#EEF2F7]">
                  <UserIcon className="h-3.5 w-3.5 text-[#6B7280]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[#172033]">{u.name}</span>
                  <span className="block truncate text-[11px] text-[#9CA3AF]">{u.username}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
