import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardListIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
  TrashIcon,
  EditIcon,
  AlertCircleIcon,
  CheckIcon,
  LayersIcon,
  PowerIcon,
  PowerOffIcon,
} from "lucide-react";
import {
  taskTemplateApi,
  type TaskTemplateDto,
  type TaskField,
  type CreateTaskTemplateInput,
} from "../api";
import { FieldDesigner } from "../components/FieldDesigner";

const PARTY = "var(--party-primary)";

function groupCount(fields: TaskField[]): number {
  return new Set(fields.map((f) => f.group || "__default__")).size;
}

export default function TaskTemplatesPage() {
  const qc = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["task-templates"],
    queryFn: () => taskTemplateApi.list(),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplateDto | null>(null);

  const templates = templatesQuery.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["task-templates"] });

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
          <ClipboardListIcon className="w-4 h-4 text-[var(--party-primary)]" />
          任务模板
        </h1>
        <span className="text-[13px] text-[#9CA3AF]">共 {templates.length} 个 · 可复用的填报表单</span>
        <div className="flex-1" />
        <button onClick={refresh} className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]">
          <RefreshCwIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          新建模板
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {templatesQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">
            尚无任务模板 —— 点右上「新建模板」定义一个可复用的填报表单(如「报送党员数据」)
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="border border-[#E9E9E9] rounded-lg p-3 hover:shadow-sm transition-shadow flex flex-col"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-1.5">
                      {t.name}
                      {!t.active && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded bg-gray-100 text-gray-500">
                          <PowerOffIcon className="w-2.5 h-2.5" />禁用
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-[#9CA3AF] mt-0.5 truncate">{t.code}</div>
                  </div>
                  {t.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEF4FF] text-[#1A6BC8] flex-shrink-0">
                      {t.category}
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-[12px] text-[#6B7280] mt-1.5 line-clamp-2">{t.description}</p>
                )}
                <div className="text-[12px] text-[#6B7280] mt-2 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardListIcon className="w-3 h-3" />
                    {t.fields.length} 字段
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <LayersIcon className="w-3 h-3" />
                    {groupCount(t.fields)} 分组
                  </span>
                </div>
                <div className="flex-1" />
                <div className="flex justify-end gap-1 mt-2 pt-2 border-t border-[#F4F4F4]">
                  <button
                    onClick={() => setEditing(t)}
                    className="flex items-center gap-1 px-2 py-1 text-[12px] rounded hover:bg-[#F7F8FA] text-[#4B5563]"
                  >
                    <EditIcon className="w-3 h-3" />编辑
                  </button>
                  <DeleteTemplateButton template={t} onDeleted={refresh} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <TemplateDialog
          existingCodes={templates.map((t) => t.code)}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      )}
      {editing && (
        <TemplateDialog
          template={editing}
          existingCodes={templates.filter((t) => t.id !== editing.id).map((t) => t.code)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DeleteTemplateButton({
  template,
  onDeleted,
}: {
  template: TaskTemplateDto;
  onDeleted: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => taskTemplateApi.remove(template.id),
    onSuccess: onDeleted,
    onError: (err: { response?: { data?: { message?: string } } }) =>
      alert(err.response?.data?.message ?? "删除失败"),
  });
  return (
    <button
      onClick={() => {
        if (confirm(`确定删除模板 "${template.name}"?已派发的任务不受影响(字段已快照)。`))
          remove.mutate();
      }}
      disabled={remove.isPending || template.builtin}
      className="flex items-center gap-1 px-2 py-1 text-[12px] rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 disabled:opacity-30"
    >
      <TrashIcon className="w-3 h-3" />删除
    </button>
  );
}

/* ─── 新建 / 编辑模板对话框(嵌 FieldDesigner)─── */
function TemplateDialog({
  template,
  existingCodes,
  onClose,
  onSaved,
}: {
  template?: TaskTemplateDto;
  existingCodes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [code, setCode] = useState(template?.code ?? "");
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const [fields, setFields] = useState<TaskField[]>(template?.fields ?? []);
  const [error, setError] = useState<string | null>(null);

  const codeValid = isEdit || /^[a-z][a-z0-9_]{1,63}$/.test(code.trim());
  const codeDup = !isEdit && existingCodes.includes(code.trim());
  const canSubmit = !!name.trim() && codeValid && !codeDup && fields.length > 0;

  const save = useMutation({
    mutationFn: () => {
      const ordered = fields.map((f, i) => ({ ...f, sortOrder: i }));
      if (isEdit) {
        return taskTemplateApi.update(template.id, {
          name: name.trim(),
          category: category.trim() || undefined,
          fields: ordered,
          active,
        });
      }
      const input: CreateTaskTemplateInput = {
        code: code.trim(),
        name: name.trim(),
        category: category.trim() || undefined,
        fields: ordered,
        active,
      };
      return taskTemplateApi.create(input);
    },
    onSuccess: onSaved,
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : (msg ?? err.message ?? "保存失败"));
    },
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
          <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A]">
              {isEdit ? `编辑模板 "${template?.name}"` : "新建任务模板"}
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Lbl label="模板名 *">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如 报送党员数据"
                  className={inputCls}
                />
              </Lbl>
              <Lbl label="代码 *" hint={isEdit ? "不可改" : "小写字母数字_"}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={isEdit}
                  placeholder="party_member_report"
                  className={`${inputCls} font-mono`}
                />
                {codeDup && <p className="text-[10px] text-red-600 mt-1">代码已被占用</p>}
              </Lbl>
              <Lbl label="分类" hint="可选">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="如 数据报送"
                  className={inputCls}
                />
              </Lbl>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-[#4B5563]">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {active ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <PowerIcon className="w-3.5 h-3.5" />启用
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <PowerOffIcon className="w-3.5 h-3.5" />禁用
                </span>
              )}
            </label>

            <div>
              <div className="text-[13px] font-medium text-[#374151] mb-1.5">填报字段设计</div>
              <FieldDesigner value={fields} onChange={setFields} />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
                <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-[#F0F0F0] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-[13px] rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              取消
            </button>
            <button
              disabled={!canSubmit || save.isPending}
              onClick={() => save.mutate()}
              className="px-4 py-2 text-[13px] font-medium text-white rounded-md disabled:opacity-50"
              style={{ backgroundColor: PARTY }}
            >
              <CheckIcon className="w-3.5 h-3.5 inline mr-0.5" />
              {save.isPending ? "保存中…" : "保存模板"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)] disabled:bg-[#F7F8FA]";

function Lbl({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[13px] font-medium text-[#374151]">{label}</span>
        {hint && <span className="text-[11px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
