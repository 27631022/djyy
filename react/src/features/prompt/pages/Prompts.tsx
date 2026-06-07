import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Save, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { promptApi, promptErrorMessage, type PromptView } from "../api";

/** 按所属功能(app)分组,保持注册表顺序 */
function groupByApp(list: PromptView[]): [string, PromptView[]][] {
  const order: string[] = [];
  const map = new Map<string, PromptView[]>();
  for (const p of list) {
    let arr = map.get(p.app);
    if (!arr) {
      arr = [];
      map.set(p.app, arr);
      order.push(p.app);
    }
    arr.push(p);
  }
  return order.map((app) => [app, map.get(app) ?? []]);
}

export default function Prompts() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["prompts"], queryFn: promptApi.list });
  const prompts = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupByApp(prompts), [prompts]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = prompts.find((p) => p.key === selectedKey) ?? prompts[0] ?? null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["prompts"] });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5 flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-[var(--party-primary)]" />
        <div>
          <h1 className="text-lg font-bold text-slate-800">AI 提示词</h1>
          <p className="text-xs text-slate-500">
            集中管理所有 AI 功能的提示词。左侧选一条、右侧编辑,改了立即生效,可随时「恢复默认」。
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[230px_1fr]">
          {/* 左:分组列表 */}
          <aside className="space-y-3">
            {groups.map(([app, items]) => (
              <div key={app}>
                <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {app}
                </div>
                <div className="space-y-0.5">
                  {items.map((p) => {
                    const active = selected?.key === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedKey(p.key)}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                          active
                            ? "bg-party-soft font-medium text-[var(--party-primary)]"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate">{p.label}</span>
                        {p.overridden && (
                          <span className="ml-auto shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">
                            已改
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* 右:选中项编辑(按 key:updatedAt 重挂载,切换/保存后取到新值) */}
          <div>
            {selected ? (
              <PromptEditor
                key={`${selected.key}:${selected.updatedAt ?? "0"}`}
                prompt={selected}
                onChanged={invalidate}
              />
            ) : (
              <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                左侧选一个提示词来编辑
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PromptEditor({ prompt, onChanged }: { prompt: PromptView; onChanged: () => void }) {
  // 初始内容 = 当前生效值;父级按 key=key:updatedAt 重挂载,save/reset 后自动取新值
  const [content, setContent] = useState(prompt.content);

  const saveMut = useMutation({
    mutationFn: () => promptApi.update(prompt.key, content),
    onSuccess: () => {
      toast.success(`「${prompt.label}」已保存`);
      onChanged();
    },
    onError: (e) => toast.error(promptErrorMessage(e)),
  });
  const resetMut = useMutation({
    mutationFn: () => promptApi.reset(prompt.key),
    onSuccess: () => {
      toast.success(`「${prompt.label}」已恢复默认`);
      onChanged();
    },
    onError: (e) => toast.error(promptErrorMessage(e)),
  });

  const dirty = content.trim() !== prompt.content.trim();
  const busy = saveMut.isPending || resetMut.isPending;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-base font-semibold text-slate-800">{prompt.label}</span>
        {prompt.overridden && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">已改</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-slate-300">{prompt.key}</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-400">{prompt.description}</p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={Math.min(28, Math.max(10, content.split("\n").length + 2))}
        disabled={busy}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-xs leading-relaxed outline-none focus:border-[var(--party-primary)] disabled:bg-slate-50"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={!dirty || busy}
          className="flex items-center gap-1 rounded-md bg-[var(--party-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          保存
        </button>
        {prompt.overridden && (
          <button
            type="button"
            onClick={() => resetMut.mutate()}
            disabled={busy}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-3.5 py-1.5 text-xs text-slate-500 hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </button>
        )}
        {dirty && <span className="text-[11px] text-amber-600">有未保存修改</span>}
      </div>
    </div>
  );
}
