import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, SearchIcon, Building2Icon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { organizationsApi } from "@/features/organization";

/** 行政机构单选(可搜索 popover)。默认排除虚拟壳。 */
export function OrgSelect({
  value,
  onChange,
  placeholder = "选择机构…",
  excludeVirtual = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  excludeVirtual?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const orgsQ = useQuery({ queryKey: ["org-list", "admin"], queryFn: () => organizationsApi.list("admin") });
  const orgs = useMemo(
    () => (orgsQ.data ?? []).filter((o) => !excludeVirtual || !o.isVirtual),
    [orgsQ.data, excludeVirtual],
  );
  const selected = orgs.find((o) => o.id === value) ?? null;
  const kw = q.trim();
  const filtered = kw ? orgs.filter((o) => o.name.includes(kw)) : orgs;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-[180px] items-center justify-between gap-2 rounded-lg border border-[#dce4ef] bg-white px-3 py-2 text-left text-sm hover:border-[var(--party-primary)]"
        >
          <span className={selected ? "truncate text-[#172033]" : "text-[#9CA3AF]"}>{selected?.name ?? placeholder}</span>
          <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-[#9CA3AF]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-0">
        <div className="border-b border-[#eef2f7] p-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索机构名…"
              className="w-full rounded-lg border border-[#dce4ef] py-2 pl-8 pr-2 text-[13px] focus:border-[var(--party-primary)] focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto p-1">
          {orgsQ.isLoading ? (
            <div className="py-6 text-center text-[13px] text-[#9CA3AF]">加载机构…</div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#9CA3AF]">无匹配机构</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                  setQ("");
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-party-soft ${
                  o.id === value ? "bg-party-soft font-medium text-[var(--party-primary)]" : "text-[#172033]"
                }`}
              >
                <Building2Icon className="h-3.5 w-3.5 flex-shrink-0 text-[#9CA3AF]" />
                <span className="flex-1 truncate">{o.name}</span>
                {o.isDept && <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-400">部门</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
