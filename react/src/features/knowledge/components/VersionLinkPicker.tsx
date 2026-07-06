import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranchIcon, SearchIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { knowledgeApi } from "../api";

export interface RevisionTarget {
  id: string;
  title: string;
}

/**
 * 「这是某篇现有文章的修订版」关联选择器 —— 搜索已发布文章,选中后建版本链;
 * 发布新版时旧版将被归档(提交时前端确认弹窗提示)。
 */
export function VersionLinkPicker({
  value,
  onChange,
}: {
  value: RevisionTarget | null;
  onChange: (v: RevisionTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["knowledge", "revision-search", q],
    queryFn: () => knowledgeApi.listArticles({ q, pageSize: 8 }),
    enabled: open && q.trim().length > 0,
  });

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
        <GitBranchIcon className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="flex-1 truncate text-amber-800">
          修订自:<span className="font-medium">{value.title}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-amber-500 hover:text-amber-700" aria-label="取消关联">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="text-gray-600">
          <GitBranchIcon className="w-4 h-4 mr-1" />
          关联为某文章的修订版
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3">
        <div className="text-xs text-gray-500 mb-2">
          制度修订场景:选择被修订的旧文章。新版发布时,旧版将自动归档(仍可在新版详情页「历史版本」中查看)。
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索文章标题…"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="mt-2 max-h-56 overflow-y-auto">
          {q.trim() === "" ? (
            <div className="py-6 text-center text-xs text-gray-400">输入关键词搜索已发布文章</div>
          ) : search.isLoading ? (
            <div className="py-6 text-center text-xs text-gray-400">搜索中…</div>
          ) : (search.data?.items.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">没有匹配的文章</div>
          ) : (
            search.data!.items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange({ id: a.id, title: a.title });
                  setOpen(false);
                  setQ("");
                }}
                className="w-full text-left px-2 py-2 rounded hover:bg-gray-50 text-sm"
              >
                <div className="truncate font-medium text-gray-800">{a.title}</div>
                <div className="text-[11px] text-gray-400">
                  {a.categoryName} · {a.typeName} · {a.authorName}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
