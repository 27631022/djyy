import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import type { ShowcaseBlockType, TemplateBlock } from "../api";
import { getTool, TOOL_LIST } from "../tools/registry";
import { newBlockId } from "../tools/shared";

/**
 * 填报规则设计器(台主用):从展示工具里挑块排序,每块定「块标题 + 填报要求」。
 * 参晒人进入晒台后按这些块逐块照填(不能增删)—— 像多次报送一样只由发起人定规则。
 * 受控 value/onChange;不编辑内容(内容是参晒人报的)。
 */
export function TemplateDesigner({
  value,
  onChange,
  locked = false,
}: {
  value: TemplateBlock[];
  onChange: (next: TemplateBlock[]) => void;
  locked?: boolean;
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
    onChange([...value, { id: newBlockId(), type, title: def.label, requirement: "" }]);
    setPaletteOpen(false);
  };

  const patch = (id: string, p: Partial<TemplateBlock>) =>
    onChange(value.map((b) => (b.id === id ? { ...b, ...p } : b)));

  return (
    <div className="space-y-2.5">
      {value.map((b, i) => {
        const def = getTool(b.type);
        if (!def) return null;
        const Icon = def.icon;
        return (
          <div key={b.id} className="rounded-xl border bg-white">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-party-soft text-xs font-bold text-[var(--party-primary)]">
                {i + 1}
              </span>
              <Icon className="h-4 w-4 text-[var(--party-primary)]" />
              <span className="text-xs text-muted-foreground">{def.label}</span>
              <input
                type="text"
                className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium hover:border-input focus:border-input focus:outline-none"
                value={b.title}
                maxLength={40}
                disabled={locked}
                placeholder={`块标题,如「本年${def.label}」`}
                onChange={(e) => patch(b.id, { title: e.target.value })}
              />
              {!locked && (
                <>
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
                    title="删除"
                    onClick={() => onChange(value.filter((x) => x.id !== b.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            <div className="px-3 py-2">
              <textarea
                className="min-h-12 w-full rounded-md border border-input bg-background p-2 text-sm"
                value={b.requirement ?? ""}
                maxLength={500}
                disabled={locked}
                placeholder="填报要求(选填),如「上传驾驶室内部照片,标注拍摄角度」——参晒人填这块时会看到"
                onChange={(e) => patch(b.id, { requirement: e.target.value || undefined })}
              />
            </div>
          </div>
        );
      })}

      {!locked &&
        (value.length < 20 ? (
          <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 py-3 text-sm text-muted-foreground hover:border-[var(--party-primary)]/40 hover:text-[var(--party-primary)]"
              >
                <Plus className="h-4 w-4" />
                添加一个填报块(选展示工具)
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
          <p className="text-center text-xs text-muted-foreground">已达上限(20 块)</p>
        ))}
    </div>
  );
}
