import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SlidersHorizontalIcon, PlusIcon, RefreshCwIcon, XIcon, TrashIcon, EditIcon,
  AlertCircleIcon, LockIcon, BookTextIcon, AsteriskIcon, CheckIcon,
  TypeIcon, HashIcon, CalendarIcon, AlignLeftIcon, ListIcon,
  PowerIcon, PowerOffIcon,
} from "lucide-react";
import {
  userCustomFieldsApi,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  type UserCustomField,
  type CustomFieldType,
  type CreateCustomFieldInput,
} from "@/features/user-custom-field";
import { dictionariesApi, type DictionaryListItem } from "@/features/dictionary";

const PARTY = "var(--party-primary)";
const PARTY_BG = "rgb(255, 240, 242)";
const ADMIN = "rgb(26, 107, 200)";

const TYPE_ICONS: Record<CustomFieldType, React.ElementType> = {
  text:     TypeIcon,
  number:   HashIcon,
  date:     CalendarIcon,
  textarea: AlignLeftIcon,
  select:   ListIcon,
};

export default function UserCustomFieldsPage() {
  const qc = useQueryClient();
  const fieldsQuery = useQuery({
    queryKey: ["user-custom-fields"],
    queryFn: () => userCustomFieldsApi.list(true),
  });
  const dictsQuery = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => dictionariesApi.list(),
    staleTime: 60_000,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingField, setEditingField] = useState<UserCustomField | null>(null);

  const fields = fieldsQuery.data ?? [];
  const dicts = dictsQuery.data ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["user-custom-fields"] });
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
          <SlidersHorizontalIcon className="w-4 h-4 text-[var(--party-primary)]" />
          用户自定义字段
        </h1>
        <span className="text-xs text-[#9CA3AF]">
          共 {fields.length} 个字段 · 启用 {fields.filter((f) => f.active).length} 个
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-[#9CA3AF] hidden md:inline">
          在用户详情的"扩展信息" tab 自动渲染为表单
        </span>
        <button
          onClick={refresh}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          新建字段
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {fieldsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
        ) : fields.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">尚未定义任何自定义字段</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#F7F8FA] z-10">
              <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
                <th className="px-4 py-2 font-medium w-14 text-right">排序</th>
                <th className="px-4 py-2 font-medium w-48">代码</th>
                <th className="px-4 py-2 font-medium">字段名</th>
                <th className="px-4 py-2 font-medium w-28">类型</th>
                <th className="px-4 py-2 font-medium w-40">字典引用</th>
                <th className="px-4 py-2 font-medium w-16 text-center">必填</th>
                <th className="px-4 py-2 font-medium w-20">状态</th>
                <th className="px-4 py-2 font-medium w-24 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const Icon = TYPE_ICONS[f.type];
                const dict = f.dictCode ? dicts.find((d) => d.code === f.dictCode) : null;
                return (
                  <tr key={f.id} className="border-b border-[#F0F0F0] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-2 text-xs text-[#9CA3AF] text-right">{f.sortOrder}</td>
                    <td className="px-4 py-2 text-xs font-mono text-[#4B5563]">{f.code}</td>
                    <td className="px-4 py-2">
                      <div className="text-[13px] font-medium text-[#1A1A1A] flex items-center gap-1.5">
                        {f.label}
                        {f.builtin && (
                          <span className="text-[9px] px-1 py-px rounded bg-gray-100 text-gray-600 flex items-center gap-0.5">
                            <LockIcon className="w-2.5 h-2.5" /> 内置
                          </span>
                        )}
                      </div>
                      {f.description && (
                        <div className="text-[10px] text-[#9CA3AF] mt-0.5">{f.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "#EEF4FF", color: ADMIN }}
                      >
                        <Icon className="w-3 h-3" />
                        {CUSTOM_FIELD_TYPE_LABELS[f.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[11px]">
                      {f.type === "select" ? (
                        dict ? (
                          <span className="inline-flex items-center gap-1 text-[#4B5563]">
                            <BookTextIcon className="w-3 h-3" />
                            {dict.name}
                            <span className="text-[#9CA3AF] font-mono">({dict.code})</span>
                          </span>
                        ) : (
                          <span className="text-amber-600 text-[10px]">
                            ⚠ 字典 {f.dictCode} 不存在
                          </span>
                        )
                      ) : (
                        <span className="text-[#D1D5DB]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {f.required ? (
                        <AsteriskIcon className="w-3.5 h-3.5 text-[var(--party-primary)] inline" />
                      ) : (
                        <span className="text-[#D1D5DB] text-[11px]">否</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {f.active ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                          <PowerIcon className="w-2.5 h-2.5" /> 启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          <PowerOffIcon className="w-2.5 h-2.5" /> 禁用
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setEditingField(f)}
                        className="p-1 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
                        title="编辑"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <DeleteFieldButton field={f} onDeleted={refresh} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <FieldDialog
          mode="create"
          dicts={dicts}
          existingCodes={fields.map((f) => f.code)}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      )}
      {editingField && (
        <FieldDialog
          mode="edit"
          field={editingField}
          dicts={dicts}
          existingCodes={fields.filter((f) => f.id !== editingField.id).map((f) => f.code)}
          onClose={() => setEditingField(null)}
          onSaved={() => {
            setEditingField(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DeleteFieldButton({ field, onDeleted }: { field: UserCustomField; onDeleted: () => void }) {
  const remove = useMutation({
    mutationFn: () => userCustomFieldsApi.remove(field.id),
    onSuccess: onDeleted,
    onError: (err: { response?: { data?: { message?: string } } }) => {
      alert(err.response?.data?.message ?? "删除失败");
    },
  });
  return (
    <button
      onClick={() => {
        if (confirm(`确定删除字段 "${field.label}" 吗?用户已有的对应值仍保留在数据库,但不再展示。`)) {
          remove.mutate();
        }
      }}
      disabled={remove.isPending || field.builtin}
      className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed ml-1"
      title={field.builtin ? "内置字段不可删除,可禁用" : "删除"}
    >
      <TrashIcon className="w-3.5 h-3.5" />
    </button>
  );
}

/* ─── 新建 / 编辑对话框 ─── */
function FieldDialog({
  mode, field, dicts, existingCodes, onClose, onSaved,
}: {
  mode: "create" | "edit";
  field?: UserCustomField;
  dicts: DictionaryListItem[];
  existingCodes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CreateCustomFieldInput & { dictCode: string; placeholder: string; description: string }>({
    code: field?.code ?? "",
    label: field?.label ?? "",
    type: field?.type ?? "text",
    dictCode: field?.dictCode ?? "",
    placeholder: field?.placeholder ?? "",
    description: field?.description ?? "",
    required: field?.required ?? false,
    sortOrder: field?.sortOrder ?? 0,
    active: field?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        label: form.label.trim(),
        type: form.type,
        dictCode: form.type === "select" ? form.dictCode.trim() || undefined : undefined,
        placeholder: form.placeholder.trim() || undefined,
        description: form.description.trim() || undefined,
        required: form.required,
        sortOrder: form.sortOrder,
        active: form.active,
      };
      if (mode === "create") {
        return userCustomFieldsApi.create({ code: form.code.trim(), ...payload });
      } else {
        // Update: 传完整 payload(后端会忽略未变化字段)
        const updatePayload: Record<string, unknown> = { ...payload };
        if (form.type !== "select") updatePayload.dictCode = null;
        return userCustomFieldsApi.update(field!.id, updatePayload);
      }
    },
    onSuccess: onSaved,
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "保存失败");
    },
  });

  const codeDup = mode === "create" && existingCodes.includes(form.code.trim());
  const codeValid = mode === "edit" || (/^[a-z][a-z0-9_]{1,59}$/.test(form.code) && !codeDup);
  const dictValid = form.type !== "select" || form.dictCode.length > 0;
  const canSubmit = form.label.trim().length >= 1 && codeValid && dictValid;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canSubmit && !save.isPending && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      save.mutate();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-lg bg-white rounded-xl shadow-2xl pointer-events-auto"
          onKeyDown={handleKeyDown}
        >
          <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A]">
              {mode === "create" ? "新建自定义字段" : `编辑 "${field?.label}"`}
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>
          <div className="p-5 space-y-3 max-h-[70vh] overflow-auto">
            <div className="grid grid-cols-2 gap-3">
              <Field label="代码 *" hint={mode === "edit" ? "不可修改" : "小写字母数字_"}>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={mode === "edit"}
                  placeholder="如 hire_date"
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)] disabled:bg-[#F7F8FA]"
                />
                {codeDup && <p className="text-[10px] text-red-600 mt-1">代码已被占用</p>}
              </Field>
              <Field label="字段名 *">
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="如 入职日期"
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
                />
              </Field>
            </div>

            <Field label="类型 *">
              <div className="grid grid-cols-5 gap-1">
                {CUSTOM_FIELD_TYPES.map((t) => {
                  const Icon = TYPE_ICONS[t];
                  const active = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, type: t, dictCode: t === "select" ? form.dictCode : "" })}
                      className="flex flex-col items-center justify-center gap-1 py-2 rounded-md border text-xs transition-colors"
                      style={{
                        borderColor: active ? PARTY : "#E9E9E9",
                        backgroundColor: active ? PARTY_BG : "white",
                        color: active ? PARTY : "#4B5563",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      {CUSTOM_FIELD_TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </Field>

            {form.type === "select" && (
              <Field label="字典引用 *" hint="从下拉选项中选取字典,值存字典项 code">
                <select
                  value={form.dictCode}
                  onChange={(e) => setForm({ ...form, dictCode: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
                >
                  <option value="">-- 选择字典 --</option>
                  {dicts.map((d) => (
                    <option key={d.id} value={d.code}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="占位符">
              <input
                value={form.placeholder}
                onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                placeholder="如 请输入身份证号"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>

            <Field label="帮助文字" hint="显示在输入框下方">
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="可选"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="排序">
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
                />
              </Field>
              <Field label="必填">
                <label className="flex items-center gap-2 text-sm h-[34px]">
                  <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
                  必填
                </label>
              </Field>
              <Field label="状态">
                <label className="flex items-center gap-2 text-sm h-[34px]">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  启用
                </label>
              </Field>
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
                <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#F0F0F0] flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]">
              取消
            </button>
            <button
              disabled={!canSubmit || save.isPending}
              onClick={() => save.mutate()}
              className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
              style={{ backgroundColor: PARTY }}
            >
              <CheckIcon className="w-3 h-3 inline mr-0.5" />
              {save.isPending ? "保存中…" : "保存"} <span className="text-[9px] opacity-70">↵</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs font-medium text-[#4B5563]">{label}</span>
        {hint && <span className="text-[10px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

