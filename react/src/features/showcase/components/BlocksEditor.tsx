import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import type { ShowcaseBlock, ShowcaseBlockType } from "../api";
import { getTool, TOOL_LIST, validateBlock } from "../tools/registry";
import { newBlockId } from "../tools/shared";

/**
 * 区块编辑器(作者态):纵向区块卡列表(上移/下移/删除)+「添加区块」工具面板。
 * 受控 value/onChange;upload 由页面注入(晒台/作品各自上传口)。
 * 提交前用 registry.findBlockIssue 拦截;本组件对有问题的块显示红色提示条。
 */
export function BlocksEditor({
  value,
  onChange,
  upload,
  max = 30,
  showIssues = false,
}: {
  value: ShowcaseBlock[];
  onChange: (next: ShowcaseBlock[]) => void;
  upload: (file: File) => Promise<{ fileId: string; name: string }>;
  max?: number;
  /** 提交被拦截后置 true,块内联显示校验问题 */
  showIssues?: boolean;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const append = (type: ShowcaseBlockType) => {
    const def = getTool(type);
    if (!def) return;
    onChange([...value, { id: newBlockId(), type, content: def.makeDefault() }]);
    setPaletteOpen(false);
  };

  return (
    <div className="space-y-3">
      {value.map((b, i) => {
        const def = getTool(b.type);
        if (!def) return null;
        const Icon = def.icon;
        const Editor = def.Editor;
        const issue = showIssues ? validateBlock(b) : null;
        return (
          <div
            key={b.id}
            id={`block-${b.id}`}
            className={`rounded-xl border bg-white ${issue ? "border-red-300 ring-1 ring-red-200" : ""}`}
          >
            <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
              <Icon className="h-4 w-4 text-[var(--party-primary)]" />
              <span className="text-sm font-medium">{def.label}</span>
              <span className="flex-1" />
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                disabled={i === 0}
                title="上移"
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                disabled={i === value.length - 1}
                title="下移"
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                title="删除区块"
                onClick={() => onChange(value.filter((x) => x.id !== b.id))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <Editor
                value={b.content}
                upload={upload}
                onChange={(content) =>
                  onChange(value.map((x) => (x.id === b.id ? { ...x, content } : x)))
                }
              />
              {issue && <p className="mt-2 text-xs text-red-600">{issue}</p>}
            </div>
          </div>
        );
      })}

      {value.length < max ? (
        <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 py-3 text-sm text-muted-foreground hover:border-[var(--party-primary)]/40 hover:text-[var(--party-primary)]"
            >
              <Plus className="h-4 w-4" />
              添加展示区块
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-2" align="center">
            <div className="grid grid-cols-3 gap-1.5">
              {TOOL_LIST.map((def) => {
                const Icon = def.icon;
                return (
                  <button
                    key={def.type}
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left hover:border-[var(--party-primary)]/50 hover:bg-party-soft"
                    title={def.description}
                    onClick={() => append(def.type)}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="h-4 w-4 text-[var(--party-primary)]" />
                      {def.label}
                    </span>
                    <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {def.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <p className="text-center text-xs text-muted-foreground">已达区块上限({max} 块)</p>
      )}
    </div>
  );
}
