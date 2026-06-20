import { TableIcon, Trash2Icon, PlusIcon } from "lucide-react";
import { CATALOG_BRING_OUT, type ReportField, type ReportFieldType } from "../api";
import type {
  FieldTypeDef,
  FieldPreviewProps,
  FieldPropsEditorProps,
  FieldFillProps,
} from "./types";
import { PROP_INPUT, FORM_BOX } from "./shared";
import { textField } from "./text";
import { numberField } from "./number";
import { selectField } from "./select";
import { dateField } from "./date";
import { catalogPickField } from "./catalog-pick";

/**
 * 明细子表 —— 一个字段 = 多行结构化明细(扶贫:一张发票挂多条产品明细)。
 * 列类型 P1 限 目录点选 / 数字 / 下拉 / 文本 / 日期(直接 import 这几个 def,不走 registry,避免循环依赖)。
 * 填报值 = 行数组,每行 = { [列code]: 该列填报值 };持久化时(Step 5)每行拆成一条 ReportLine。
 */
const COLUMN_DEFS: FieldTypeDef[] = [catalogPickField, numberField, selectField, textField, dateField];
const colDef = (type: ReportFieldType): FieldTypeDef =>
  COLUMN_DEFS.find((d) => d.type === type) ?? textField;

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "(无)" },
  { value: "product", label: "产品(带出名称/分类/产地)" },
  { value: "amount", label: "含税金额" },
  { value: "feeSource", label: "费用来源" },
  { value: "qty", label: "数量" },
];

const newColCode = () => `col_${Math.random().toString(36).slice(2, 8)}`;

function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  const cols = f.columns ?? [];
  if (variant === "form")
    return <div className={FORM_BOX}>明细子表（{cols.length} 列,可增删行）</div>;
  return (
    <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            {cols.map((c) => (
              <th key={c.code} className="px-2 py-1 text-left font-medium">
                {c.label}
              </th>
            ))}
            {cols.length === 0 && <th className="px-2 py-1 text-left text-gray-300">未配置列</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            {cols.map((c) => (
              <td key={c.code} className="px-2 py-1.5 text-gray-300">
                —
              </td>
            ))}
            {cols.length === 0 && <td className="px-2 py-1.5" />}
          </tr>
        </tbody>
      </table>
      <div className="border-t border-gray-100 px-2 py-1 text-[11px] text-gray-400">＋ 可增删明细行</div>
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  const cols = f.columns ?? [];
  const setCols = (next: ReportField[]) => patch({ columns: next });
  const updateCol = (i: number, p: Partial<ReportField>) =>
    setCols(cols.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const addCol = () =>
    setCols([
      ...cols,
      { code: newColCode(), label: "新列", type: "text", required: false, sortOrder: cols.length },
    ]);
  const removeCol = (i: number) => setCols(cols.filter((_, j) => j !== i));
  const switchType = (i: number, type: ReportFieldType) =>
    updateCol(i, { type, ...(colDef(type).makeDefaults?.() ?? {}) });

  return (
    <div className="space-y-2.5">
      {cols.map((c, i) => {
        const ColProps = colDef(c.type).Properties;
        return (
          <div key={c.code} className="space-y-2 rounded-md border border-[#E5E7EB] p-2">
            <div className="flex items-center gap-1.5">
              <input
                value={c.label}
                onChange={(e) => updateCol(i, { label: e.target.value })}
                placeholder="列名"
                className={`${PROP_INPUT} flex-1`}
              />
              <label className="flex items-center gap-1 text-[11px] text-[#6B7280]">
                <input
                  type="checkbox"
                  checked={c.required}
                  onChange={(e) => updateCol(i, { required: e.target.checked })}
                />
                必填
              </label>
              <button
                type="button"
                title="删除列"
                onClick={() => removeCol(i)}
                className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={c.type}
                onChange={(e) => switchType(i, e.target.value as ReportFieldType)}
                className={PROP_INPUT}
              >
                {COLUMN_DEFS.map((d) => (
                  <option key={d.type} value={d.type}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                value={c.role ?? ""}
                onChange={(e) => updateCol(i, { role: e.target.value || undefined })}
                className={PROP_INPUT}
                title="汇总/考核时该列映射到哪个结构化字段"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {ColProps && (
              <div className="border-t border-gray-50 pt-1.5">
                <ColProps field={c} patch={(p) => updateCol(i, p)} />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addCol}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#dce4ef] py-1.5 text-[12px] text-[#667085] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        添加列
      </button>
    </div>
  );
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  const cols = f.columns ?? [];
  const rows: Record<string, unknown>[] = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const setRows = (next: Record<string, unknown>[]) => onChange(next);
  const addRow = () => setRows([...rows, {}]);
  const removeRow = (i: number) => setRows(rows.filter((_, j) => j !== i));
  const setCell = (i: number, code: string, v: unknown) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [code]: v } : r)));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-[#E5E7EB]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="w-8 px-2 py-1.5">#</th>
              {cols.map((c) => (
                <th key={c.code} className="px-2 py-1.5 font-medium">
                  {c.label}
                  {c.required && <span className="text-red-500">*</span>}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 2} className="px-2 py-4 text-center text-gray-400">
                  暂无明细,点下方「添加一行」
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 align-top text-gray-400">{i + 1}</td>
                  {cols.map((c) => {
                    const Fill = colDef(c.type).FillInput;
                    return (
                      <td key={c.code} className="px-2 py-1.5 align-top">
                        {Fill ? (
                          <Fill field={c} value={row[c.code]} onChange={(v) => setCell(i, c.code, v)} />
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 align-top">
                    <button
                      type="button"
                      title="删除该行"
                      onClick={() => removeRow(i)}
                      className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[#dce4ef] px-3 py-1.5 text-[13px] text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="h-4 w-4" />
        添加一行
      </button>
    </div>
  );
}

export const detailTableField: FieldTypeDef = {
  type: "detail_table",
  label: "明细子表",
  icon: TableIcon,
  order: 11,
  ownProps: ["columns"],
  makeDefaults: () => ({
    columns: [
      {
        code: "product",
        label: "帮扶产品",
        type: "catalog_pick",
        required: true,
        sortOrder: 0,
        role: "product",
        bringOut: CATALOG_BRING_OUT.map((c) => c.key),
      },
      { code: "amount", label: "购买金额", type: "number", required: true, sortOrder: 1, role: "amount", unit: "元" },
    ],
  }),
  Preview,
  Properties,
  FillInput,
  validate: (f) => {
    const cols = f.columns ?? [];
    if (cols.length === 0) return "明细子表至少要有一列";
    for (const c of cols) {
      if (!c.label?.trim()) return "明细子表有未命名的列";
      const msg = colDef(c.type).validate?.(c);
      if (msg) return `明细列「${c.label}」:${msg}`;
    }
    return null;
  },
};
