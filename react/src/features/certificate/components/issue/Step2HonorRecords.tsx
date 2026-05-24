/**
 * 发证向导 Step 2 — 表彰记录表格(V3 新核心)。
 *
 * 一行 = 一项荣誉(多荣誉时多行)。来源:
 *   - Step 1 AI 抽取后,顶部「应用 AI 识别」按钮一键灌入 records,模板按 honorName 模糊匹配
 *   - 手动「新增表彰记录」逐行添加
 *
 * 列:表彰年度 / 荣誉名称(模板下拉)/ 表彰日期 / 表彰类型(个人/集体) / 操作
 *
 * 类型切换:
 *   - 切到 individual → 清掉 collectives
 *   - 切到 collective → 清掉 persons
 *
 * 选模板时:
 *   - honorName 从 template.name 冗余进来,便于后续步骤渲染
 *   - 没有 honorCode 的模板不能选(发证编号生成需要)
 */

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";

import {
  certificateTemplateApi,
  type CertificateTemplateDto,
  type ExtractHonorResponse,
} from "../../api";
import {
  newCollectiveRow,
  newHonorRecord,
  newPersonRow,
  type HonorRecord,
  type HonorType,
} from "../../lib/certificateDraft";

const PARTY = "var(--party-primary)";

/* ─── 主组件 ─── */

export function Step2HonorRecords({
  records,
  onRecordsChange,
  extracted,
}: {
  records: HonorRecord[];
  onRecordsChange: (records: HonorRecord[]) => void;
  extracted: ExtractHonorResponse | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });
  const templates: CertificateTemplateDto[] = data ?? [];

  /* ─── AI 识别:把抽取结果灌进 records ─── */
  const applyAi = useMemo(
    () => () => {
      if (!extracted || extracted.honors.length === 0) return;
      const generated = extracted.honors.map((h) => {
        // 按 honorName 模糊匹配模板:大小写无关,双向 includes,加 honorCode 兜底
        const matched = templates.find((t) => {
          if (!t.honorCode || !t.name) return false;
          const hn = h.honorName.toLowerCase();
          const tn = t.name.toLowerCase();
          const tc = t.honorCode.toLowerCase();
          return hn.includes(tn) || tn.includes(hn) || hn.includes(tc);
        });
        // honorType 兼容老 'unit' → collective
        const honorType: HonorType =
          h.honorType === "individual" ? "individual" : h.honorType ? "collective" : "individual";
        return newHonorRecord({
          templateId: matched?.id ?? null,
          honorName: matched?.name ?? h.honorName,
          yearLabel: extracted.yearLabel || String(new Date().getFullYear()),
          issueDate: extracted.issueDate || todayIso(),
          honorType,
          // 抽取到的 recipients 提前预填(Step 3a/3b 可继续编辑)
          persons:
            honorType === "individual"
              ? h.recipients.map((r) =>
                  newPersonRow({
                    name: r.name,
                    empNo: r.empNo ?? "",
                    dept: r.dept ?? "",
                    found: false,
                  }),
                )
              : [],
          collectives:
            honorType === "collective"
              ? h.recipients.map((r) => newCollectiveRow({ name: r.name }))
              : [],
        });
      });
      onRecordsChange(generated);
      const matchedCount = generated.filter((r) => r.templateId).length;
      toast.success(
        `AI 识别完成:已生成 ${generated.length} 条表彰记录,自动匹配模板 ${matchedCount}/${generated.length}`,
      );
    },
    [extracted, templates, onRecordsChange],
  );

  /* ─── 首次进入 Step 2:若 records 为空且有抽取结果 → 自动应用一次 ─── */
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current) return;
    if (!extracted || extracted.honors.length === 0) return;
    if (records.length > 0) return;
    if (templates.length === 0) return; // 等模板列表加载完再 match
    autoAppliedRef.current = true;
    applyAi();
  }, [extracted, records.length, templates.length, applyAi]);

  /* ─── 行操作 ─── */
  function patchRow(rid: string, p: Partial<HonorRecord>) {
    onRecordsChange(
      records.map((r) => {
        if (r.rid !== rid) return r;
        const updated: HonorRecord = { ...r, ...p };
        // 切类型时清掉另一边的子列表
        if (p.honorType && p.honorType !== r.honorType) {
          if (p.honorType === "individual") updated.collectives = [];
          else updated.persons = [];
        }
        // 改模板时同步 honorName(冗余,便于 Step 4 预览)
        if (p.templateId !== undefined && p.templateId !== r.templateId) {
          const t = templates.find((tt) => tt.id === p.templateId);
          updated.honorName = t?.name ?? r.honorName;
        }
        return updated;
      }),
    );
  }
  function removeRow(rid: string) {
    onRecordsChange(records.filter((r) => r.rid !== rid));
  }
  function addRow() {
    onRecordsChange([...records, newHonorRecord()]);
  }

  /* ─── 渲染 ─── */
  const hasExtract = Boolean(extracted && extracted.honors.length > 0);

  return (
    <div>
      <div className="flex items-start justify-between mb-1 gap-3">
        <div>
          <h2 className="text-base font-bold text-[#1A1A1A]">第二步 · 建立表彰记录</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            一行 = 一项荣誉。多荣誉(如「两优一先」)可建多行。荣誉名称只能从已有模板选择。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={applyAi}
            disabled={!hasExtract}
            className="text-xs px-2.5 py-1.5 rounded border-2 border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            title={
              !hasExtract
                ? "Step 1 没有抽取结果,该按钮不可用"
                : records.length > 0
                  ? "重新应用 AI 识别(将覆盖当前所有记录)"
                  : "应用 AI 识别结果生成表彰记录"
            }
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            {records.length > 0 ? "重新应用 AI 识别" : `AI 识别(${extracted?.honors.length ?? 0} 项候选)`}
          </button>
          <button
            type="button"
            disabled
            className="text-xs px-2.5 py-1.5 rounded border border-[#E9E9E9] text-[#9CA3AF] cursor-not-allowed"
            title="本期 MVP 暂不开放此入口。如需新模板,请联系管理员先在「证书模板」页创建并填写 honorCode。"
          >
            设计模板(暂不开放)
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white mt-4">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA]">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left w-28">表彰年度 *</th>
              <th className="px-2 py-2 text-left">荣誉名称(模板) *</th>
              <th className="px-2 py-2 text-left w-36">表彰日期 *</th>
              <th className="px-2 py-2 text-left w-44">表彰类型 *</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-xs text-[#9CA3AF]">
                  {hasExtract ? (
                    <>
                      还没有表彰记录 — 点右上「AI 识别」一键导入,
                      或点下方「新增表彰记录」手动添加
                    </>
                  ) : (
                    <>
                      还没有表彰记录 — 点下方「新增表彰记录」开始,
                      或回 Step 1 上传文件用 AI 识别
                    </>
                  )}
                </td>
              </tr>
            ) : (
              records.map((r, i) => (
                <RecordRow
                  key={r.rid}
                  idx={i + 1}
                  record={r}
                  templates={templates}
                  templatesLoading={isLoading}
                  onPatch={(p) => patchRow(r.rid, p)}
                  onRemove={() => removeRow(r.rid)}
                  removable={records.length > 1 || records.length === 0}
                />
              ))
            )}
          </tbody>
        </table>
        <div className="px-2 py-2 border-t border-[#F0F0F0] bg-[#FAFAFB] flex items-center justify-between">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-[11px] text-[var(--party-primary)] hover:underline"
          >
            <PlusIcon className="w-3 h-3" />
            新增表彰记录
          </button>
          <span className="text-[10px] text-[#9CA3AF]">
            共 {records.length} 条
          </span>
        </div>
      </div>

      {/* 模板库为空提示 */}
      {!isLoading && templates.length === 0 && (
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 flex items-start gap-2">
          <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            还没有可用的证书模板,请先去「证书模板」页创建至少一个模板并填写 honorCode。
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 表格行 ─── */

function RecordRow({
  idx,
  record,
  templates,
  templatesLoading,
  onPatch,
  onRemove,
  removable,
}: {
  idx: number;
  record: HonorRecord;
  templates: CertificateTemplateDto[];
  templatesLoading: boolean;
  onPatch: (p: Partial<HonorRecord>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const selectedTemplate = templates.find((t) => t.id === record.templateId) ?? null;
  // 缺 honorCode 的模板不能选(发证编号生成需要)
  const usableTemplates = templates.filter((t) => t.honorCode && t.honorCode.trim());
  const missingTemplate = !record.templateId;

  return (
    <tr className={missingTemplate ? "bg-red-50/40" : ""}>
      <td className="px-2 py-1.5 text-[#9CA3AF] font-mono align-top pt-2.5">{idx}</td>
      {/* 年份 */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={record.yearLabel}
          onChange={(e) => onPatch({ yearLabel: e.target.value.trim() })}
          placeholder="2024"
          className="w-full px-1.5 py-1 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
      </td>
      {/* 模板下拉 */}
      <td className="px-2 py-1.5">
        <select
          value={record.templateId ?? ""}
          onChange={(e) => onPatch({ templateId: e.target.value || null })}
          disabled={templatesLoading}
          className={`w-full px-1.5 py-1 text-xs rounded border focus:outline-none ${
            missingTemplate
              ? "border-red-300 bg-red-50 focus:border-red-500"
              : "border-[#E9E9E9] focus:border-[var(--party-primary)]"
          }`}
        >
          <option value="">
            {templatesLoading
              ? "加载模板中…"
              : usableTemplates.length === 0
                ? "(暂无可用模板)"
                : "— 请选择 —"}
          </option>
          {usableTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}({t.honorCode})
            </option>
          ))}
        </select>
        {selectedTemplate && (
          <div className="text-[10px] text-[#9CA3AF] mt-0.5 font-mono">
            honorCode = {selectedTemplate.honorCode}
          </div>
        )}
      </td>
      {/* 表彰日期 */}
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={record.issueDate}
          onChange={(e) => onPatch({ issueDate: e.target.value })}
          className="w-full px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
      </td>
      {/* 表彰类型 toggle */}
      <td className="px-2 py-1.5">
        <div className="inline-flex rounded border border-[#E9E9E9] overflow-hidden">
          {(
            [
              { v: "individual" as const, label: "个人" },
              { v: "collective" as const, label: "集体" },
            ]
          ).map((opt) => {
            const active = record.honorType === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onPatch({ honorType: opt.v })}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--party-primary)] text-white"
                    : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
                }`}
                style={active ? { backgroundColor: PARTY } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {/* 抽取阶段已带 recipients,显示一下数量,让用户对齐预期 */}
        {record.honorType === "individual" && record.persons.length > 0 && (
          <div className="text-[10px] text-[#9CA3AF] mt-0.5">
            预填 {record.persons.length} 位个人
          </div>
        )}
        {record.honorType === "collective" && record.collectives.length > 0 && (
          <div className="text-[10px] text-[#9CA3AF] mt-0.5">
            预填 {record.collectives.length} 个集体
          </div>
        )}
      </td>
      {/* 删除 */}
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={onRemove}
          disabled={!removable}
          className="p-1 rounded text-[#9CA3AF] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
          title="删除该行"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

/* ─── 工具 ─── */

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
