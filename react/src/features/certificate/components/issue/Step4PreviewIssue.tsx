/**
 * V3 Phase 7:三列预览 + 统一发证。
 *
 * 布局:
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │ 顶部:标题 / 元数据 / 进度条(发证中或已完成时显示)                    │
 *   ├──────────┬──────────────────────┬────────────────────────────────────────┤
 *   │ 左 20%   │ 中 40%               │ 右 1fr                                 │
 *   │ record   │ 选中 record 的受     │ 当前 hover 的收件人在该模板下的实时    │
 *   │ 列表     │ 表彰对象列表 + 状态  │ 渲染预览(canvasRenderer 复用)        │
 *   └──────────┴──────────────────────┴────────────────────────────────────────┘
 *
 * 数据流:
 *  - records / templates / results / yearLabel / issueDate / issuing / onIssueAll
 *    都从父容器 CertificateIssue 透传。Step 4 自己只持有 selectedRecordIdx 和 hovered
 *    两个 UI 状态。
 *  - 鼠标 hover 中列某行 → 右列拿对应 record 的 template designJson,注入 sampleValue
 *    后调 PreviewCanvas 渲染。预览的 certNo 用占位符(发证后才有真实编号)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  EyeIcon,
} from "lucide-react";

import type { CertificateTemplateDto } from "@/features/certificate";
import { PreviewCanvas } from "./PreviewCanvas";
import {
  flattenRecipients,
  type FlatRecipient,
  type HonorRecord,
} from "../../lib/certificateDraft";
import type { DesignerState } from "../../lib/designerTypes";

/* ─── 与容器约定的结果形态 ─── */

export interface IssueResult {
  /** 唯一 key:`${recordRid}-${recipientRid}` */
  key: string;
  recordIndex: number;
  name: string;
  ok: boolean;
  certNo?: string;
  reason?: string;
}

interface Step4PreviewIssueProps {
  records: HonorRecord[];
  templates: Map<string, CertificateTemplateDto>;
  yearLabel: string;
  issueDate: string;
  results: IssueResult[];
  issuing: boolean;
  totalRecipients: number;
  /** 父容器持有的发证执行函数,Step 4 只是个 view */
  onIssueAll: () => void;
}

/* ─── 小工具 ─── */

function formatChineseDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[1]}年${m[2]}月${m[3]}日`;
}

/** 预览时还没真发证 → certNo 用 batch 形态的占位 */
function placeholderCertNo(
  yearLabel: string,
  honorCode: string | null,
  total: number,
  seqIdx: number,
): string {
  const code = honorCode ?? "----";
  const totalStr = String(Math.max(1, total)).padStart(2, "0");
  const seqStr = String(seqIdx + 1).padStart(3, "0");
  return `${yearLabel}-${code}-${totalStr}-${seqStr}`;
}

/* ─── 主组件 ─── */

export function Step4PreviewIssue({
  records,
  templates,
  yearLabel,
  issueDate,
  results,
  issuing,
  totalRecipients,
  onIssueAll,
}: Step4PreviewIssueProps) {
  const [selectedRecordIdx, setSelectedRecordIdx] = useState(0);
  // 当前 hover 的收件人;null = fallback 到选中 record 的第 1 个
  const [hovered, setHovered] = useState<{
    recordIdx: number;
    recipientRid: string;
  } | null>(null);

  const safeSelectedIdx = Math.min(
    Math.max(0, selectedRecordIdx),
    Math.max(0, records.length - 1),
  );
  const selectedRecord = records[safeSelectedIdx];
  const selectedTemplate = selectedRecord?.templateId
    ? templates.get(selectedRecord.templateId)
    : undefined;
  const selectedRecipients = useMemo(
    () => (selectedRecord ? flattenRecipients(selectedRecord) : []),
    [selectedRecord],
  );

  // 切换选中 record 时清掉 hover,避免引用旧 record 的 rid
  useEffect(() => {
    setHovered(null);
  }, [safeSelectedIdx]);

  // 兜底 hover:默认看选中 record 的第 1 个收件人
  const effectiveHover = hovered ?? {
    recordIdx: safeSelectedIdx,
    recipientRid: selectedRecipients[0]?.rid ?? "",
  };

  /* 右列预览数据 — record / template / 变量值都解析好 */
  const preview = useMemo(() => {
    const rec = records[effectiveHover.recordIdx];
    if (!rec) return null;
    const t = rec.templateId ? templates.get(rec.templateId) : undefined;
    if (!t) return null;

    let state: DesignerState;
    try {
      state = JSON.parse(t.designJson) as DesignerState;
    } catch {
      return { error: "模板 designJson 解析失败" as const };
    }

    const recipients = flattenRecipients(rec);
    const idx = recipients.findIndex((r) => r.rid === effectiveHover.recipientRid);
    if (idx < 0 || recipients.length === 0) return null;
    const recipient = recipients[idx];

    const variables: Record<string, string> = {
      name: recipient.name,
      issueDate: formatChineseDate(issueDate),
      certNo: placeholderCertNo(yearLabel, t.honorCode, recipients.length, idx),
    };
    if (recipient.dept) variables.department = recipient.dept;

    return { state, template: t, variables, recipient };
  }, [effectiveHover, records, templates, yearLabel, issueDate]);

  /* 进度统计 */
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const pct = totalRecipients
    ? Math.round((results.length / totalRecipients) * 100)
    : 0;

  /* ── 渲染 ── */

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 顶部:标题 + 元数据 + 进度 */}
      <div className="rounded-lg bg-white border border-[#E9E9E9] px-4 py-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#1A1A1A]">
              第四步 · 清单 + 一键发证
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              共 <b className="text-[#1A1A1A]">{records.length}</b> 条表彰记录 · 合计{" "}
              <b className="text-[#1A1A1A]">{totalRecipients}</b> 张待发证 · 表彰年度{" "}
              <span className="font-mono text-[#1A1A1A]">{yearLabel}</span> · 颁发日期{" "}
              <span className="font-mono text-[#1A1A1A]">{issueDate}</span>
            </p>
          </div>
          {(issuing || results.length > 0) && (
            <div className="flex-1 min-w-[280px] max-w-[460px]">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-[#1A1A1A]">
                  {issuing ? "发证中…" : "完成"}
                </span>
                <span className="font-mono text-[#6B7280]">
                  {results.length} / {totalRecipients}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#F0F0F0] overflow-hidden mb-1.5">
                <div
                  className="h-full bg-gradient-to-r from-[var(--party-primary)] to-[var(--party-accent)] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2Icon className="w-3.5 h-3.5" />
                  成功 {okCount}
                </span>
                {failCount > 0 && (
                  <span className="flex items-center gap-1 text-red-700">
                    <AlertCircleIcon className="w-3.5 h-3.5" />
                    失败 {failCount}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主体:3 列 */}
      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{
          gridTemplateColumns: "minmax(180px, 20%) minmax(280px, 40%) 1fr",
        }}
      >
        <RecordListColumn
          records={records}
          templates={templates}
          selectedIdx={safeSelectedIdx}
          onSelect={(idx) => setSelectedRecordIdx(idx)}
          results={results}
        />

        <RecipientListColumn
          record={selectedRecord}
          template={selectedTemplate}
          recipients={selectedRecipients}
          recordIndex={safeSelectedIdx}
          results={results}
          hoveredRid={effectiveHover.recipientRid}
          onHover={(rid) =>
            setHovered({
              recordIdx: safeSelectedIdx,
              recipientRid: rid,
            })
          }
        />

        <PreviewColumn preview={preview} />
      </div>

      {/* 底部提示(初始态) */}
      {!issuing && results.length === 0 && (
        <p className="text-[11px] text-[#9CA3AF] text-center px-2">
          点底部「全部发证」开始 · hover 中列一行可在右列实时预览证书 · 单张失败不影响其他继续发
        </p>
      )}

      {/* 防 lint 把 prop 当 unused — 实际由父容器底部按钮调起 */}
      {!onIssueAll && null}
    </div>
  );
}

/* ─── 左列:record 列表 ─── */

function RecordListColumn({
  records,
  templates,
  selectedIdx,
  onSelect,
  results,
}: {
  records: HonorRecord[];
  templates: Map<string, CertificateTemplateDto>;
  selectedIdx: number;
  onSelect: (idx: number) => void;
  results: IssueResult[];
}) {
  return (
    <aside className="rounded-lg bg-white border border-[#E9E9E9] overflow-auto">
      <div className="sticky top-0 bg-white border-b border-[#F0F0F0] px-3 py-2 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
        表彰记录 ({records.length})
      </div>
      <div className="p-1.5 flex flex-col gap-1">
        {records.map((r, i) => {
          const t = r.templateId ? templates.get(r.templateId) : undefined;
          const recipients = flattenRecipients(r);
          const recordResults = results.filter((rr) => rr.recordIndex === i);
          const recordOk = recordResults.filter((rr) => rr.ok).length;
          const recordFail = recordResults.length - recordOk;
          const isCollective = r.honorType === "collective";
          const selected = i === selectedIdx;
          return (
            <button
              key={r.rid}
              type="button"
              onClick={() => onSelect(i)}
              className={`text-left rounded-md p-2 border transition-colors ${
                selected
                  ? "bg-party-soft border-[var(--party-primary)]"
                  : "border-transparent hover:bg-[#F7F8FA]"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`inline-flex items-center gap-1 text-[9px] px-1 py-0.5 rounded font-semibold border ${
                    isCollective
                      ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-orange-100 text-orange-700 border-orange-200"
                  }`}
                >
                  {isCollective ? (
                    <Building2Icon className="w-2.5 h-2.5" />
                  ) : null}
                  {isCollective ? "集体" : "个人"}
                </span>
                <span className="text-[10px] text-[#9CA3AF] font-mono">
                  #{i + 1}
                </span>
              </div>
              <div className="text-xs font-semibold text-[#1A1A1A] truncate">
                {r.honorName || t?.name || "未命名"}
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">
                {t ? (
                  <>
                    <span className="font-mono">{t.honorCode ?? "?"}</span> ·{" "}
                    {recipients.length} 张
                  </>
                ) : (
                  "未选模板"
                )}
              </div>
              {recordResults.length > 0 && (
                <div className="flex items-center gap-2 mt-1 text-[10px]">
                  {recordOk > 0 && (
                    <span className="text-green-700">✓ {recordOk}</span>
                  )}
                  {recordFail > 0 && (
                    <span className="text-red-700">✗ {recordFail}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ─── 中列:选中 record 的收件人 + 状态 ─── */

function RecipientListColumn({
  record,
  template,
  recipients,
  recordIndex,
  results,
  hoveredRid,
  onHover,
}: {
  record: HonorRecord | undefined;
  template: CertificateTemplateDto | undefined;
  recipients: FlatRecipient[];
  recordIndex: number;
  results: IssueResult[];
  hoveredRid: string;
  onHover: (rid: string) => void;
}) {
  if (!record) {
    return (
      <div className="rounded-lg bg-white border border-[#E9E9E9] flex items-center justify-center text-xs text-[#9CA3AF]">
        左侧选择一条表彰记录
      </div>
    );
  }
  const isCollective = record.honorType === "collective";
  const headerColor = isCollective
    ? "bg-blue-50 border-blue-200"
    : "bg-orange-50 border-orange-200";
  const chipColor = isCollective
    ? "bg-blue-100 text-blue-700 border-blue-300"
    : "bg-orange-100 text-orange-700 border-orange-300";

  return (
    <div className="rounded-lg bg-white border border-[#E9E9E9] flex flex-col overflow-hidden">
      {/* header */}
      <div
        className={`px-3 py-2 border-b flex items-center gap-2 flex-wrap ${headerColor}`}
      >
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${chipColor}`}
        >
          {isCollective ? "集体" : "个人"}
        </span>
        <span className="text-sm font-semibold text-[#1A1A1A] truncate">
          {record.honorName || template?.name || "未命名"}
        </span>
        <span className="text-[11px] text-[#6B7280]">
          · 模板 {template?.name ?? "?"} ·{" "}
          <span className="font-mono">{template?.honorCode ?? "?"}</span>
        </span>
      </div>

      {/* table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA] sticky top-0 z-10">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left">
                {isCollective ? "集体名" : "姓名"}
              </th>
              {!isCollective && (
                <th className="px-2 py-1.5 text-left w-24">员工号</th>
              )}
              {!isCollective && (
                <th className="px-2 py-1.5 text-left">部门</th>
              )}
              <th className="px-2 py-1.5 text-left">证书编号 / 状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {recipients.length === 0 && (
              <tr>
                <td
                  colSpan={isCollective ? 3 : 5}
                  className="px-3 py-6 text-center text-[#9CA3AF]"
                >
                  该记录暂无受表彰对象 — 回 Step 3 录入
                </td>
              </tr>
            )}
            {recipients.map((r, i) => {
              const res = results.find(
                (rr) =>
                  rr.recordIndex === recordIndex &&
                  rr.key === `${record.rid}-${r.rid}`,
              );
              const isHover = r.rid === hoveredRid;
              return (
                <tr
                  key={r.rid}
                  onMouseEnter={() => onHover(r.rid)}
                  onFocus={() => onHover(r.rid)}
                  tabIndex={0}
                  className={`cursor-default transition-colors ${
                    isHover ? "bg-party-soft" : "hover:bg-[#F7F8FA]"
                  }`}
                >
                  <td className="px-2 py-1.5 text-[#9CA3AF] font-mono">
                    {i + 1}
                  </td>
                  <td className="px-2 py-1.5 text-[#1A1A1A]">
                    <span className="flex items-center gap-1.5">
                      {isHover && (
                        <EyeIcon className="w-3 h-3 text-[var(--party-primary)] flex-shrink-0" />
                      )}
                      {r.name}
                    </span>
                  </td>
                  {!isCollective && (
                    <td className="px-2 py-1.5 font-mono text-[#6B7280]">
                      {r.empNo || "—"}
                    </td>
                  )}
                  {!isCollective && (
                    <td className="px-2 py-1.5 text-[#6B7280] truncate max-w-0">
                      {r.dept || "—"}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <StatusCell res={res} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[#F0F0F0] px-3 py-1.5 text-[10px] text-[#9CA3AF] bg-[#FAFAFA]">
        {recipients.length} 张待发证 · hover 任意行右侧实时预览
      </div>
    </div>
  );
}

function StatusCell({ res }: { res: IssueResult | undefined }) {
  if (!res) return <span className="text-[#9CA3AF]">待发证</span>;
  if (res.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 font-mono">
        <CheckCircle2Icon className="w-3.5 h-3.5" />
        {res.certNo}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-red-700"
      title={res.reason}
    >
      <AlertCircleIcon className="w-3.5 h-3.5" />
      失败:{(res.reason ?? "").slice(0, 30)}
    </span>
  );
}

/* ─── 右列:实时预览画布 ─── */

type PreviewState =
  | null
  | {
      state: DesignerState;
      template: CertificateTemplateDto;
      variables: Record<string, string>;
      recipient: FlatRecipient;
    }
  | { error: "模板 designJson 解析失败" };

function PreviewColumn({ preview }: { preview: PreviewState }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 600, h: 440 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        setSize({
          w: Math.max(240, Math.floor(rect.width - 32)),
          h: Math.max(180, Math.floor(rect.height - 80)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="rounded-lg bg-white border border-[#E9E9E9] flex flex-col overflow-hidden"
    >
      <div className="border-b border-[#F0F0F0] px-3 py-2 text-[11px] font-semibold text-[#6B7280] flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <EyeIcon className="w-3.5 h-3.5" />
          证书预览
        </span>
        {preview && "recipient" in preview && (
          <span className="text-[10px] font-mono text-[#9CA3AF] truncate ml-2">
            {preview.recipient.name} · {preview.template.honorCode ?? "?"}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-[#F4F5F8]">
        {preview === null && (
          <div className="text-xs text-[#9CA3AF] text-center px-4">
            选中一条记录后,hover 中列任意收件人
            <br />
            这里会实时渲染该收件人的证书预览
          </div>
        )}
        {preview && "error" in preview && (
          <div className="text-xs text-red-700 text-center px-4">
            <AlertCircleIcon className="w-5 h-5 inline mr-1 mb-0.5" />
            {preview.error}
          </div>
        )}
        {preview && "state" in preview && (
          <PreviewCanvas
            state={preview.state}
            variableValues={preview.variables}
            maxWidth={size.w}
            maxHeight={size.h}
          />
        )}
      </div>
      {preview && "recipient" in preview && (
        <div className="border-t border-[#F0F0F0] px-3 py-1.5 text-[10px] text-[#9CA3AF] bg-[#FAFAFA]">
          预览证号 <span className="font-mono">{preview.variables.certNo}</span>
          {" · "}
          实际编号在发证时按 batch 自动生成
        </div>
      )}
    </div>
  );
}
