import { useState } from "react";
import { CopyIcon, SearchIcon, FileTextIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import type { TaskListItem } from "../api";

/**
 * 「复制往期任务字段」点选带搜索 —— 替代原生 select。
 * Popover:顶部搜索框 + 可点选的往期任务列表(任务名 + 字段数),点一项即载入其字段。
 */
export function CopyTaskPicker({
  tasks,
  onPick,
  disabled,
}: {
  tasks: TaskListItem[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const filtered = kw ? tasks.filter((t) => t.title.toLowerCase().includes(kw)) : tasks;
  const empty = tasks.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || empty}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border border-[#dce4ef] bg-white text-[#344054] hover:border-[var(--party-primary)] disabled:opacity-50"
        >
          <CopyIcon className="w-4 h-4" />
          {empty ? "无往期任务可复制" : "复制往期任务字段"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 overflow-hidden">
        <div className="p-2 border-b border-[#eef2f7]">
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索任务名…"
              className="w-full pl-8 pr-2 py-2 text-[13px] border border-[#dce4ef] rounded-lg focus:outline-none focus:border-[var(--party-primary)]"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto p-1">
          {filtered.length === 0 ? (
            <div className="text-[13px] text-[#9CA3AF] text-center py-6">无匹配任务</div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onPick(t.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-party-soft"
              >
                <FileTextIcon className="w-4 h-4 text-[#246BFE] flex-shrink-0" />
                <span className="flex-1 min-w-0 text-[13px] text-[#172033] truncate">{t.title}</span>
                <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{t.fieldCount} 字段</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
