/**
 * 发证向导 Step 2 — 表彰记录(V3 新核心,重做版)。
 *
 * 顶部共享区:
 *   - 表彰年度(yearLabel)
 *   - 表彰日期(issueDate)
 *   同一份表彰文件下所有荣誉共用,不再 per-row 维护
 *
 * 表彰记录表格(一行 = 一项荣誉):
 *   序号 / 荣誉名称(AI 识别) / 证书模板(picker)/ 操作
 *
 * 模板带出荣誉类型 + 等级:
 *   - 用户不再选个人/集体 toggle,由 template.honorType 决定
 *   - 卡片网格 / 表格行均展示模板的「等级 + 类型」徽章
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  AwardIcon,
  Building2Icon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";

import {
  certificateTemplateApi,
  HONOR_LEVEL_LABEL,
  HONOR_TYPE_LABEL,
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
  yearLabel,
  onYearLabelChange,
  issueDate,
  onIssueDateChange,
  extracted,
}: {
  records: HonorRecord[];
  onRecordsChange: (records: HonorRecord[]) => void;
  yearLabel: string;
  onYearLabelChange: (v: string) => void;
  issueDate: string;
  onIssueDateChange: (v: string) => void;
  extracted: ExtractHonorResponse | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });
  const templates: CertificateTemplateDto[] = useMemo(() => data ?? [], [data]);

  /* ─── 模板选择器弹窗 ─── */
  const [picker, setPicker] = useState<{ rid: string } | null>(null);

  /* ─── AI 识别:把抽取结果灌进 records + 顶部共享字段 ─── */
  const applyAi = useMemo(
    () => () => {
      if (!extracted || extracted.honors.length === 0) return;
      // 顶部共享字段从 extracted 取
      if (extracted.yearLabel) onYearLabelChange(extracted.yearLabel);
      if (extracted.issueDate) onIssueDateChange(extracted.issueDate);

      const generated = extracted.honors.map((h) => {
        const matched = templates.find((t) => {
          if (!t.honorCode || !t.name) return false;
          const hn = h.honorName.toLowerCase();
          const tn = t.name.toLowerCase();
          const tc = t.honorCode.toLowerCase();
          return hn.includes(tn) || tn.includes(hn) || hn.includes(tc);
        });
        // V3:honorType 以模板为准(若已匹配),否则用 AI 推断兜底
        const honorType: HonorType = matched?.honorType
          ? matched.honorType
          : h.honorType === "individual"
            ? "individual"
            : h.honorType
              ? "collective"
              : "individual";
        return newHonorRecord({
          templateId: matched?.id ?? null,
          // 保留 AI 识别的原始荣誉名(显示在表格第 2 列,不被模板覆盖)
          honorName: h.honorName,
          honorType,
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
    [extracted, templates, onRecordsChange, onYearLabelChange, onIssueDateChange],
  );

  /* ─── 首次进入 Step 2:若 records 为空且有抽取结果 → 自动应用一次 ─── */
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current) return;
    if (!extracted || extracted.honors.length === 0) return;
    if (records.length > 0) return;
    if (templates.length === 0) return;
    autoAppliedRef.current = true;
    applyAi();
  }, [extracted, records.length, templates.length, applyAi]);

  /* ─── 行操作 ─── */
  function patchRow(rid: string, p: Partial<HonorRecord>) {
    // 先算 toast 提示(避免在 map 纯函数里产生副作用)
    const target = records.find((r) => r.rid === rid);
    if (target) {
      // 直接切 honorType pill
      if (p.honorType && p.honorType !== target.honorType) {
        const lost =
          p.honorType === "individual"
            ? target.collectives.length
            : target.persons.length;
        if (lost > 0) {
          const label = p.honorType === "individual" ? "个人" : "集体";
          toast.info(`已切换为「${label}」,原 ${lost} 条数据已清空`);
        }
      }
      // 改模板导致类型变(模板是权威)
      if (p.templateId !== undefined && p.templateId !== target.templateId) {
        const t = templates.find((tt) => tt.id === p.templateId);
        if (t?.honorType) {
          const nextType: HonorType =
            t.honorType === "collective" ? "collective" : "individual";
          // 已经在上面 honorType 分支提示过就别重了
          const explicitlySwitched = p.honorType && p.honorType !== target.honorType;
          if (!explicitlySwitched && nextType !== target.honorType) {
            const lost =
              nextType === "individual"
                ? target.collectives.length
                : target.persons.length;
            if (lost > 0) {
              const label = nextType === "individual" ? "个人" : "集体";
              toast.info(
                `按新模板切换为「${label}」,原 ${lost} 条数据已清空`,
              );
            }
          }
        }
      }
    }

    onRecordsChange(
      records.map((r) => {
        if (r.rid !== rid) return r;
        const updated: HonorRecord = { ...r, ...p };
        // 切类型时清掉另一边的子列表
        if (p.honorType && p.honorType !== r.honorType) {
          if (p.honorType === "individual") updated.collectives = [];
          else updated.persons = [];
        }
        // 改模板时:
        //  1) honorName 仅在原本为空时回填模板名,保留 AI 已识别的原文
        //  2) honorType 强制同步模板(模板是权威);若与上一次不同则清掉子列表
        if (p.templateId !== undefined && p.templateId !== r.templateId) {
          const t = templates.find((tt) => tt.id === p.templateId);
          if (!updated.honorName.trim()) {
            updated.honorName = t?.name ?? "";
          }
          if (t?.honorType) {
            const nextType: HonorType =
              t.honorType === "collective" ? "collective" : "individual";
            if (nextType !== updated.honorType) {
              updated.honorType = nextType;
              if (nextType === "individual") updated.collectives = [];
              else updated.persons = [];
            }
          }
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
  const pickerRecord = picker ? records.find((r) => r.rid === picker.rid) ?? null : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">第二步 · 建立表彰记录</h2>
          <p className="text-sm text-[#9CA3AF] mt-1">
            一行 = 一项荣誉。多荣誉(如「两优一先」)可建多行。荣誉名称由所选模板决定。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={applyAi}
            disabled={!hasExtract}
            className="text-sm px-3 py-2 rounded border-2 border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            title={
              !hasExtract
                ? "Step 1 没有抽取结果,该按钮不可用"
                : records.length > 0
                  ? "重新应用 AI 识别(将覆盖当前所有记录)"
                  : "应用 AI 识别结果生成表彰记录"
            }
          >
            <SparklesIcon className="w-4 h-4" />
            {records.length > 0
              ? "重新应用 AI 识别"
              : `AI 识别(${extracted?.honors.length ?? 0} 项候选)`}
          </button>
          <button
            type="button"
            disabled
            className="text-sm px-3 py-2 rounded border border-[#E9E9E9] text-[#9CA3AF] cursor-not-allowed"
            title="本期 MVP 暂不开放此入口。如需新模板,请联系管理员先在「证书模板」页创建并填写荣誉代码。"
          >
            设计模板(暂不开放)
          </button>
        </div>
      </div>

      {/* 顶部共享字段:表彰年度 + 表彰日期 */}
      <div className="rounded-lg border border-[#E9E9E9] bg-white p-4 mb-4">
        <div className="text-sm font-semibold text-[#1A1A1A] mb-3">
          本次表彰共享信息
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <label className="block">
            <span className="block text-sm font-medium text-[#374151] mb-1.5">
              表彰年度 <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={yearLabel}
              onChange={(e) => onYearLabelChange(e.target.value.trim())}
              placeholder="2024 或 2024-2025"
              className="w-full px-3 py-2 text-sm font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
            <span className="block text-xs text-[#9CA3AF] mt-1">
              同一份表彰文件下所有荣誉共用此年份
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-[#374151] mb-1.5">
              表彰日期 <span className="text-red-500">*</span>
            </span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => onIssueDateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
            <span className="block text-xs text-[#9CA3AF] mt-1">
              所有荣誉证书共用此颁发日期
            </span>
          </label>
        </div>
      </div>

      {/* 表彰记录表格 */}
      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
        <div className="px-4 py-2.5 border-b border-[#F0F0F0] bg-[#F7F8FA] flex items-center justify-between">
          <span className="text-sm font-semibold text-[#1A1A1A]">表彰记录</span>
          <span className="text-xs text-[#9CA3AF]">
            共 {records.length} 条
          </span>
        </div>
        {/* table-fixed:让各列按 w-* 设置紧贴排列,不被「荣誉名称」自然撑开吞掉余空间 */}
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-14" />
            <col className="w-60" />
            <col className="w-60" />
            <col className="w-64" />
            <col className="w-12" />
          </colgroup>
          <thead className="bg-[#FAFAFB]">
            <tr className="text-xs text-[#6B7280] uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">序号</th>
              <th className="px-3 py-2.5 text-left">荣誉名称(AI 识别)</th>
              <th className="px-3 py-2.5 text-left">证书模板 *</th>
              <th className="px-3 py-2.5 text-left">等级 · 类型 · 落款单位</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-[#9CA3AF]">
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
                  onPickTemplate={() => setPicker({ rid: r.rid })}
                  onRemove={() => removeRow(r.rid)}
                />
              ))
            )}
          </tbody>
        </table>
        <div className="px-3 py-2.5 border-t border-[#F0F0F0] bg-[#FAFAFB]">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-sm text-[var(--party-primary)] hover:underline font-medium"
          >
            <PlusIcon className="w-4 h-4" />
            新增表彰记录
          </button>
        </div>
      </div>

      {/* 模板库为空提示 */}
      {!isLoading && templates.length === 0 && (
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 flex items-start gap-2">
          <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            还没有可用的证书模板,请先去「证书模板」页创建至少一个模板并填写荣誉代码。
          </div>
        </div>
      )}

      {/* 模板选择弹窗 */}
      {pickerRecord && (
        <TemplatePickerModal
          templates={templates}
          loading={isLoading}
          currentTemplateId={pickerRecord.templateId}
          onClose={() => setPicker(null)}
          onPick={(t) => {
            patchRow(pickerRecord.rid, { templateId: t.id });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── 表格行 ─── */

function RecordRow({
  idx,
  record,
  templates,
  onPickTemplate,
  onRemove,
}: {
  idx: number;
  record: HonorRecord;
  templates: CertificateTemplateDto[];
  onPickTemplate: () => void;
  onRemove: () => void;
}) {
  const selectedTemplate = templates.find((t) => t.id === record.templateId) ?? null;
  const missingTemplate = !record.templateId;
  const aiName = record.honorName.trim();

  return (
    <tr className={missingTemplate ? "bg-red-50/40" : ""}>
      <td className="px-3 py-3 text-[#9CA3AF] font-mono align-top pt-4 text-sm">{idx}</td>

      {/* 第 2 列:AI 识别出的荣誉名称(纯文字,不可改) */}
      <td className="px-3 py-3 align-top">
        <div className="text-base font-semibold text-[#1A1A1A] break-words">
          {aiName || <span className="text-[#9CA3AF] italic font-normal">(未识别,手动添加行)</span>}
        </div>
        {/* 预填数量提示,让用户对齐预期 */}
        {record.honorType === "individual" && record.persons.length > 0 && (
          <div className="text-xs text-[#9CA3AF] mt-1.5">
            AI 预填 {record.persons.length} 位个人
          </div>
        )}
        {record.honorType === "collective" && record.collectives.length > 0 && (
          <div className="text-xs text-[#9CA3AF] mt-1.5">
            AI 预填 {record.collectives.length} 个集体
          </div>
        )}
      </td>

      {/* 第 3 列:证书模板(模板名 + 荣誉代码 + 分类 + 更换按钮) */}
      <td className="px-3 py-3 align-top">
        {selectedTemplate ? (
          <div className="flex flex-col gap-1">
            <div
              className="text-sm font-semibold text-[#1A1A1A] truncate"
              title={selectedTemplate.name}
            >
              {selectedTemplate.name}
            </div>
            <div className="text-[11px] text-[#9CA3AF] font-mono truncate">
              荣誉代码 = {selectedTemplate.honorCode}
            </div>
            {selectedTemplate.category && (
              <div className="text-[11px] text-[#6B7280] truncate" title={`分类:${selectedTemplate.category}`}>
                分类:{selectedTemplate.category}
              </div>
            )}
            {/* 「更换模板」按钮 — 细描边主题色,不抢戏 */}
            <button
              type="button"
              onClick={onPickTemplate}
              className="self-start mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--party-primary)] text-[11px] text-[var(--party-primary)] hover:bg-party-soft transition-colors"
              title="选择其他模板"
            >
              <PencilIcon className="w-2.5 h-2.5" />
              更换模板
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPickTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded border-2 border-dashed border-red-300 bg-red-50 text-sm text-red-700 hover:border-red-500"
          >
            <AwardIcon className="w-4 h-4" />
            请选择模板
          </button>
        )}
      </td>

      {/* 第 4 列:等级 · 类型 · 落款单位(模板属性独立展示) */}
      <td className="px-3 py-3 align-top">
        {selectedTemplate ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedTemplate.honorLevel && (
                <HonorLevelBadge level={selectedTemplate.honorLevel} />
              )}
              <HonorTypeBadge
                type={
                  selectedTemplate.honorType === "collective"
                    ? "collective"
                    : "individual"
                }
              />
            </div>
            {selectedTemplate.issuingOrgName ? (
              <div
                className="flex items-start gap-1 text-xs text-emerald-700"
                title={`落款单位:${selectedTemplate.issuingOrgName}`}
              >
                <Building2Icon className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span className="break-words">
                  {selectedTemplate.issuingOrgName}
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-[#9CA3AF]">
                (模板未填落款单位)
              </div>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-[#9CA3AF]">
            选定模板后显示
          </span>
        )}
      </td>

      {/* 第 5 列:删除 */}
      <td className="px-3 py-3 text-center align-top pt-3">
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
          title="删除该行"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

/* ─── 类型/等级徽章 ─── */

function HonorLevelBadge({ level }: { level: string }) {
  // 内置 3 级 + 字典扩展时兜底用 slate 中性色
  const cls =
    HONOR_LEVEL_CLS[level] ??
    "bg-slate-50 text-slate-700 border-slate-200";
  const label = HONOR_LEVEL_LABEL[level] ?? level;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

/** 内置 3 级的色阶;管理员加新字典项时走兜底 slate */
const HONOR_LEVEL_CLS: Record<string, string> = {
  company: "bg-slate-50 text-slate-700 border-slate-200",
  department: "bg-blue-50 text-blue-700 border-blue-200",
  subsidiary: "bg-orange-50 text-orange-700 border-orange-200",
};

function HonorTypeBadge({ type }: { type: "individual" | "collective" }) {
  const map = {
    individual: "bg-blue-50 text-blue-700 border-blue-200",
    collective: "bg-purple-50 text-purple-700 border-purple-200",
  }[type];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${map}`}>
      {HONOR_TYPE_LABEL[type]}
    </span>
  );
}

/* ─── 模板选择弹窗 ─── */

function TemplatePickerModal({
  templates,
  loading,
  currentTemplateId,
  onClose,
  onPick,
}: {
  templates: CertificateTemplateDto[];
  loading: boolean;
  currentTemplateId: string | null;
  onClose: () => void;
  onPick: (t: CertificateTemplateDto) => void;
}) {
  const [search, setSearch] = useState("");
  // 关闭时按 ESC
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const usable = templates.filter((t) => t.honorCode && t.honorCode.trim());
  const q = search.trim().toLowerCase();
  const filtered = q
    ? usable.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.honorCode ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      )
    : usable;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center gap-3">
          <AwardIcon className="w-5 h-5" style={{ color: PARTY }} />
          <div className="flex-1">
            <h3 className="text-base font-bold text-[#1A1A1A]">选择证书模板</h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              点击模板卡片选定;模板需带荣誉代码才能用于发证
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
            title="关闭(Esc)"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-5 py-3 border-b border-[#F0F0F0]">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模板名 / 荣誉代码 / 描述"
              className="w-full pl-9 pr-3 py-2 text-sm rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="text-center text-sm text-[#9CA3AF] py-12">加载模板中…</div>
          ) : usable.length === 0 ? (
            <div className="text-center text-sm text-[#9CA3AF] py-12">
              暂无可用模板。请先去「证书模板」页创建并填写荣誉代码。
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-[#9CA3AF] py-12">
              没有匹配「{search}」的模板
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((t) => {
                const active = t.id === currentTemplateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onPick(t)}
                    className={`relative text-left rounded-lg overflow-hidden border-2 transition-all hover:shadow ${
                      active
                        ? "border-[var(--party-primary)] shadow-md"
                        : "border-[#E9E9E9] hover:border-[var(--party-primary)]"
                    }`}
                  >
                    <div
                      className="relative bg-gradient-to-br from-[#F4F5F8] to-[#E9EBF0] overflow-hidden"
                      style={{ aspectRatio: "4 / 3" }}
                    >
                      {t.thumbnail ? (
                        <div className="absolute inset-0 flex items-center justify-center p-3">
                          <img
                            src={t.thumbnail}
                            alt={t.name}
                            className="max-w-full max-h-full object-contain bg-white shadow-sm"
                            style={{ aspectRatio: `${t.width} / ${t.height}` }}
                          />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[#B5B9C0] text-xs">
                          暂无预览
                        </div>
                      )}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--party-primary)] text-white">
                        {t.honorCode}
                      </span>
                      {active && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--party-primary)] text-white flex items-center justify-center">
                          <CheckIcon className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <div className="text-sm font-medium text-[#1A1A1A] truncate" title={t.name}>
                        {t.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {t.honorLevel && <HonorLevelBadge level={t.honorLevel} />}
                        {t.honorType && (
                          <HonorTypeBadge
                            type={t.honorType === "collective" ? "collective" : "individual"}
                          />
                        )}
                      </div>
                      {t.description && (
                        <div className="text-xs text-[#9CA3AF] truncate mt-1" title={t.description}>
                          {t.description}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 底 */}
        <div className="px-5 py-3 border-t border-[#E9E9E9] flex items-center justify-between bg-[#FAFAFB]">
          <span className="text-xs text-[#9CA3AF]">
            匹配 {filtered.length} / 可用 {usable.length} 个模板
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-[#E9E9E9] hover:bg-[#F7F8FA] text-[#6B7280]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
