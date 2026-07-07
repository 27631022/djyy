import { Milestone, Plus, Trash2 } from "lucide-react";
import { showcaseFileUrl } from "../api";
import type { ToolDef, ToolEditorProps } from "./types";
import { ImagePick, TextInput } from "./widgets";

/** 时间轴:实事从受理到办结的节点、人物成长历程(按录入顺序纵向展示) */
interface TimelineItem {
  date?: string;
  title?: string;
  description?: string;
  fileId?: string;
}

export interface TimelineContent extends Record<string, unknown> {
  items?: TimelineItem[];
}

function TimelineEditor({ value, onChange, upload }: ToolEditorProps<TimelineContent>) {
  const items = value.items ?? [];
  const setItem = (i: number, patch: Partial<TimelineItem>) =>
    onChange({ ...value, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex gap-3 rounded-lg border bg-muted/20 p-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <TextInput
                className="w-32"
                value={it.date}
                maxLength={20}
                placeholder="时间,如「3月12日」"
                onChange={(v) => setItem(i, { date: v })}
              />
              <TextInput
                className="flex-1"
                value={it.title}
                maxLength={100}
                placeholder="节点标题,如「受理群众诉求」"
                onChange={(v) => setItem(i, { title: v })}
              />
            </div>
            <textarea
              className="min-h-14 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={it.description ?? ""}
              maxLength={1000}
              placeholder="节点说明(选填)"
              onChange={(e) => setItem(i, { description: e.target.value || undefined })}
            />
          </div>
          <ImagePick
            className="h-24 w-32 shrink-0"
            fileId={it.fileId}
            upload={upload}
            removable
            label="配图(选填)"
            onPick={(fid) => setItem(i, { fileId: fid })}
          />
          {items.length > 1 && (
            <button
              type="button"
              className="self-start p-1 text-muted-foreground hover:text-red-500"
              onClick={() => onChange({ ...value, items: items.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {items.length < 50 && (
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-[var(--party-primary)] hover:underline"
          onClick={() => onChange({ ...value, items: [...items, {}] })}
        >
          <Plus className="h-4 w-4" />
          加一个节点
        </button>
      )}
    </div>
  );
}

function TimelineDisplay({ value }: { value: TimelineContent }) {
  const items = (value.items ?? []).filter((it) => it.date && it.title);
  if (items.length === 0) return null;
  return (
    <ol className="relative ml-3 space-y-6 border-l-2 border-[var(--party-primary)]/20 pl-6">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--party-primary)] ring-4 ring-red-50" />
          <div className="text-xs font-medium text-[var(--party-primary)]">{it.date}</div>
          <div className="mt-0.5 text-sm font-semibold">{it.title}</div>
          {it.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{it.description}</p>
          )}
          {it.fileId && (
            <img
              src={showcaseFileUrl(it.fileId)}
              alt={it.title ?? ""}
              className="mt-2 max-h-48 rounded-lg border object-cover"
              loading="lazy"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

export const timelineTool: ToolDef<TimelineContent> = {
  type: "timeline",
  label: "时间轴",
  icon: Milestone,
  order: 8,
  description: "一件实事从受理到办结的节点历程,可配图",
  makeDefault: () => ({ items: [{}] }),
  Editor: TimelineEditor,
  Display: TimelineDisplay,
  validate: (v) => {
    const items = v.items ?? [];
    if (items.length === 0) return "时间轴还没有节点";
    if (items.some((it) => !it.date?.trim() || !it.title?.trim()))
      return "时间轴有节点缺时间或标题(补上或删除)";
    return null;
  },
};
