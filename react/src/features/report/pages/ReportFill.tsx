import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  FileTextIcon,
  Building2Icon,
  ClockIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
  CheckCircle2Icon,
  ArrowLeftIcon,
  SparklesIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { downloadBlob } from "@/shared/lib/download";
import {
  reportApi,
  centsToYuan,
  type ReportFillData,
  type ReportSubmissionRow,
  type ReportField,
  type InvoiceExtractResult,
  type CatalogPickValue,
} from "../api";
import { getFieldType } from "../fields";

const SUB_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  submitted: { label: "已提交·待审", bg: "#FEF3C7", color: "#B45309" },
  approved: { label: "已通过", bg: "#DCFCE7", color: "#047857" },
  returned: { label: "已退回", bg: "#FEE2E2", color: "#B91C1C" },
};

function errMsg(e: unknown, fb: string): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === "string" ? m : fb;
}

export default function ReportFill() {
  const { targetId } = useParams<{ targetId: string }>();
  const q = useQuery({ queryKey: ["report-fill", targetId], queryFn: () => reportApi.getFill(targetId!), enabled: !!targetId });

  if (q.isLoading) return <div className="p-10 text-center text-sm text-gray-400">加载录入页…</div>;
  if (q.error) return <div className="p-10 text-center text-sm text-red-500">{errMsg(q.error, "无法打开录入页")}</div>;
  if (!q.data) return null;
  return <FillInner key={q.data.taskId} data={q.data} targetId={targetId!} />;
}

function FillInner({ data, targetId }: { data: ReportFillData; targetId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fields = [...data.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formKey, setFormKey] = useState(0);
  const [extracted, setExtracted] = useState<InvoiceExtractResult | null>(null);
  // 转人工审核确认弹窗:display=展示原因+提示,note=额外提示(规格/销售方,后端不计算的部分)
  const [check, setCheck] = useState<{ display: string[]; note?: string } | null>(null);

  const save = useMutation({
    mutationFn: (note?: string) =>
      reportApi.saveSubmission(targetId, formData, {
        discrepancyNote: note,
        supplier: extracted?.supplier ?? undefined,
        // 发票各行价税合计(元)→ 后端权威比对「单项金额对上」
        invoiceLines: extracted ? extracted.lines.map((l) => (l.amountYuan ?? 0) + (l.taxYuan ?? 0)) : undefined,
      }),
    onSuccess: (row) => {
      toast.success(row.status === "approved" ? "已提交,系统自动审核通过 ✓" : "已提交,将由审核人审核");
      setFormData({});
      setFormKey((k) => k + 1);
      setExtracted(null);
      setCheck(null);
      qc.invalidateQueries({ queryKey: ["report-fill", targetId] });
      qc.invalidateQueries({ queryKey: ["report-inbox"] });
    },
    onError: (e) => toast.error(errMsg(e, "提交失败"), { duration: 7000 }),
  });
  const del = useMutation({
    mutationFn: (id: string) => reportApi.deleteSubmission(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["report-fill", targetId] });
    },
    onError: (e) => toast.error(errMsg(e, "删除失败")),
  });

  // AI 识别发票 → 按字段 role 自动填入(发票号/日期/采买明细);费用来源等需人工选择的不动
  const applyExtract = (res: InvoiceExtractResult) => {
    setFormData((prev) => {
      const next = { ...prev };
      const byRole = (r: string) => fields.find((f) => f.role === r);
      const invNo = byRole("invoiceNo");
      if (invNo && res.invoiceNo) next[invNo.code] = res.invoiceNo;
      const pd = byRole("purchaseDate");
      if (pd && res.purchaseDate) next[pd.code] = res.purchaseDate;
      const dt = fields.find((f) => f.type === "detail_table");
      if (dt && res.lines.length) {
        const cols = dt.columns ?? [];
        const productCol = cols.find((c) => c.role === "product");
        const amountCol = cols.find((c) => c.role === "amount");
        next[dt.code] = res.lines.map((ln) => {
          const row: Record<string, unknown> = {};
          // 命中清单 → 完整快照(目录点选已绑定);未命中 → 只填名称+规格,承办人点选确认
          if (productCol) row[productCol.code] = ln.match ?? { productName: ln.productName, spec: ln.spec };
          // 含税金额 = 不含税 + 税额(任一为空按 0 计);两者都空则不填
          if (amountCol && (ln.amountYuan != null || ln.taxYuan != null))
            row[amountCol.code] = (ln.amountYuan ?? 0) + (ln.taxYuan ?? 0);
          return row;
        });
      }
      return next;
    });
  };
  const extract = useMutation({
    mutationFn: (fileId: string) => reportApi.extractInvoice(fileId, data.catalogTag ?? undefined),
    onSuccess: (res) => {
      setExtracted(res);
      applyExtract(res);
      const parts = [`发票号 ${res.invoiceNo || "—"}`, `${res.lines.length} 行明细`];
      if (res.source.matchedCount) parts.push(`${res.source.matchedCount} 项已自动匹配清单`);
      toast.success(`识别完成:${parts.join(" · ")},请核对后提交`);
    },
    onError: (e) => toast.error(errMsg(e, "发票识别失败"), { duration: 8000 }),
  });

  async function downloadNotice() {
    if (!data.noticeFileId) return;
    try {
      const blob = await storageApi.fetchBlob(data.noticeFileId);
      downloadBlob(blob, data.noticeFileName ?? "通知文件");
    } catch {
      toast.error("通知文件下载失败");
    }
  }

  const fmtYuan = (n: number) =>
    n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 从明细行算出 含税合计 + 行数 + 未关联采购库行数(实时合计 + 提交前核对)。金额列即含税金额。
  function enteredTotals() {
    const dt = fields.find((f) => f.type === "detail_table");
    if (!dt) return { total: 0, rows: 0, unmatched: 0 };
    const cols = dt.columns ?? [];
    const productCol = cols.find((c) => c.role === "product");
    const amountCol = cols.find((c) => c.role === "amount");
    const rows = Array.isArray(formData[dt.code]) ? (formData[dt.code] as Record<string, unknown>[]) : [];
    let total = 0;
    let unmatched = 0;
    let n = 0;
    for (const r of rows) {
      const pick = productCol ? (r[productCol.code] as CatalogPickValue | null | undefined) : null;
      const hasProduct = !!pick && typeof pick === "object" && !!pick.productName;
      const a = amountCol ? Number(r[amountCol.code]) : NaN;
      if (!hasProduct && !Number.isFinite(a)) continue; // 空行
      n++;
      if (Number.isFinite(a)) total += a;
      if (hasProduct && !pick!.catalogItemId) unmatched++;
    }
    return { total, rows: n, unmatched };
  }

  // 自动审批判定(与后端同口径):① 每项明细都命中扶贫目录 ② 每项金额(价税合计)都能在发票各行金额里找到对应。
  // 两条全满足 → 提交即系统自动通过;否则转人工审核。发票总额不参与(一张发票可只上报其中的扶贫明细)。
  function computeVerdict(): { reasons: string[]; safe: boolean } {
    const dt = fields.find((f) => f.type === "detail_table");
    const reasons: string[] = [];
    if (!dt) return { reasons, safe: false };
    const cols = dt.columns ?? [];
    const productCol = cols.find((c) => c.role === "product");
    const amountCol = cols.find((c) => c.role === "amount");
    const rows = Array.isArray(formData[dt.code]) ? (formData[dt.code] as Record<string, unknown>[]) : [];
    const enteredCents: number[] = [];
    let unmatched = 0;
    let hasRows = false;
    for (const r of rows) {
      const pick = productCol ? (r[productCol.code] as CatalogPickValue | null | undefined) : null;
      const hasProduct = !!pick && typeof pick === "object" && !!pick.productName;
      const a = amountCol ? Number(r[amountCol.code]) : NaN;
      if (!hasProduct && !Number.isFinite(a)) continue; // 空行
      hasRows = true;
      if (hasProduct && !pick!.catalogItemId) unmatched++;
      if (Number.isFinite(a)) enteredCents.push(Math.round(a * 100));
    }
    if (!hasRows) return { reasons, safe: false };
    if (unmatched > 0) reasons.push(`${unmatched} 项不在扶贫清单目录,需审核人核定对应商品`);
    if (!extracted) {
      reasons.push("未做发票识别,金额无法与发票自动比对");
    } else {
      const pool = extracted.lines.map((l) => Math.round(((l.amountYuan ?? 0) + (l.taxYuan ?? 0)) * 100));
      let amountBad = 0;
      for (const c of enteredCents) {
        const i = pool.findIndex((x) => x === c);
        if (i < 0) amountBad++;
        else pool.splice(i, 1);
      }
      if (amountBad > 0) reasons.push(`${amountBad} 项明细金额与发票不一致`);
    }
    return { reasons, safe: reasons.length === 0 };
  }

  // 仅提示(不影响自动通过):规格近似、销售方缺失 —— 这些后端不计算,作为附注随提交记录给审核人
  function advisoryNotes(): string[] {
    if (!extracted) return [];
    const out: string[] = [];
    const specBad = extracted.lines.filter((l) => l.specMismatch).length;
    if (specBad) out.push(`${specBad} 项规格与采购库略有差异(已取最接近项,建议核对)`);
    if (!extracted.supplier) out.push("未识别到发票销售方,请核对");
    return out;
  }

  // 提交:安全→直接提交(后端判自动通过);否则弹确认,确认后转人工审核
  function onSubmitClick() {
    const v = computeVerdict();
    if (v.safe) {
      save.mutate(undefined);
      return;
    }
    const adv = advisoryNotes();
    setCheck({ display: [...v.reasons, ...adv], note: adv.length ? adv.join(";") : undefined });
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeftIcon className="h-4 w-4" />
        返回我的待办
      </button>

      {/* 任务头 */}
      <header className="mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">{data.taskTitle}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {data.unitOrgName && (
            <span className="inline-flex items-center gap-1">
              <Building2Icon className="h-3.5 w-3.5" />
              {data.unitOrgName}
            </span>
          )}
          {data.dueAt && (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              截止 {data.dueAt.replace("T", " ").slice(0, 16)}
            </span>
          )}
          {(data.dispatchOrgName || data.dispatchUserName) && (
            <span>
              派发:{data.dispatchOrgName ?? ""} {data.dispatchUserName ?? ""}
              {data.dispatchUserPhone && (
                <a href={`tel:${data.dispatchUserPhone}`} className="ml-1 inline-flex items-center gap-0.5 text-[#1A6BC8]">
                  <PhoneIcon className="h-3 w-3" />
                  {data.dispatchUserPhone}
                </a>
              )}
            </span>
          )}
        </div>
        {data.notes && <p className="mt-2 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-sm text-gray-600">{data.notes}</p>}
        {data.noticeFileId && (
          <button onClick={downloadNotice} className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#1A6BC8] hover:underline">
            <FileTextIcon className="h-4 w-4" />
            下载通知文件{data.noticeFileName ? `（${data.noticeFileName}）` : ""}
          </button>
        )}
      </header>

      {/* 录入一张发票 */}
      <section className="mb-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800">
          <PlusIcon className="h-4 w-4 text-[var(--party-primary)]" />
          录入一张发票
        </h2>
        {/* AI 识别后:自动审批预览(将自动通过 / 将转人工审核)+ 销售方 + 附注 */}
        {extracted &&
          (() => {
            const v = computeVerdict();
            const adv = advisoryNotes();
            const willReview = !v.safe;
            return (
              <div
                className={`mb-4 rounded-lg border p-3 text-[13px] ${
                  willReview ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {willReview ? <AlertTriangleIcon className="h-4 w-4" /> : <CheckCircle2Icon className="h-4 w-4" />}
                  {willReview ? "提交后将转人工审核" : "核对一致 · 提交后系统自动审核通过"}
                </div>
                <div className="mt-1.5 space-y-1">
                  <div>
                    销售方:{extracted.supplier || <span className="font-medium text-red-600">未识别(请核对)</span>}
                  </div>
                  {v.reasons.map((w, i) => (
                    <div key={`r${i}`} className="flex gap-1.5">
                      <span>•</span>
                      {w}
                    </div>
                  ))}
                  {adv.map((w, i) => (
                    <div key={`a${i}`} className="flex gap-1.5 text-gray-500">
                      <span>·</span>
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        <div key={formKey} className="space-y-4">
          {fields.map((f) => (
            <FillField
              key={f.code}
              field={f}
              value={formData[f.code]}
              onChange={(v) => setFormData((p) => ({ ...p, [f.code]: v }))}
              onAiExtract={(fileId) => extract.mutate(fileId)}
              aiBusy={extract.isPending}
            />
          ))}
        </div>
        {(() => {
          const t = enteredTotals();
          return (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <div className="text-[13px] text-gray-500">
                {t.rows > 0 ? (
                  <>
                    本张共 {t.rows} 项,
                    <b className="text-[var(--party-primary)]">含税合计 ¥{fmtYuan(t.total)}</b>
                    {t.unmatched > 0 && (
                      <span className="ml-2 text-amber-600">· {t.unmatched} 项未关联采购库</span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">填写明细后这里显示含税合计</span>
                )}
              </div>
              <button
                onClick={onSubmitClick}
                disabled={save.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-5 py-2 text-sm text-white disabled:opacity-50"
              >
                {save.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <CheckCircle2Icon className="h-4 w-4" />}
                提交本张发票
              </button>
            </div>
          );
        })()}
      </section>

      {/* 已录发票 */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-800">已录发票（{data.submissions.length} 张）</h2>
        {data.submissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 py-10 text-center text-sm text-gray-400">
            还没有录入发票。上面填一张「单据 + 明细」,提交后出现在这里;可继续录多张。
          </div>
        ) : (
          <div className="space-y-3">
            {data.submissions.map((sub) => (
              <SubmissionCard key={sub.id} sub={sub} onDelete={() => del.mutate(sub.id)} deleting={del.isPending} />
            ))}
          </div>
        )}
      </section>

      {/* 提交前确认:不满足自动通过,将转人工审核 */}
      {check && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setCheck(null)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-semibold text-amber-700">
              <AlertTriangleIcon className="h-5 w-5" />
              提交后将转人工审核
            </h3>
            <p className="mt-1 text-sm text-gray-500">本张不满足「系统自动通过」条件,提交后将交由审核人审核:</p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
              {check.display.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-500">•</span>
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-400">确认可继续提交,原因会记录并提示审核人;也可返回修改后再提交以争取自动通过。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCheck(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                返回修改
              </button>
              <button
                onClick={() => save.mutate(check.note)}
                disabled={save.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {save.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
                仍要提交(转人工审核)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FillField({
  field,
  value,
  onChange,
  onAiExtract,
  aiBusy,
}: {
  field: ReportField;
  value: unknown;
  onChange: (v: unknown) => void;
  onAiExtract?: (fileId: string) => void;
  aiBusy?: boolean;
}) {
  const Def = getFieldType(field.type);
  // 开启 AI 识别的文件/图片字段:取已上传文件的 fileId(值形如 [{id,name}])
  const fileId =
    field.aiExtract && Array.isArray(value) && value[0] && typeof value[0] === "object"
      ? ((value[0] as { id?: string }).id ?? null)
      : null;
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
        {field.description && <span className="ml-2 text-xs font-normal text-gray-400">{field.description}</span>}
      </div>
      {Def.FillInput ? (
        <Def.FillInput field={field} value={value} onChange={onChange} />
      ) : (
        <div className="text-xs text-gray-400">(该字段类型暂不支持填报)</div>
      )}
      {field.aiExtract && onAiExtract && (
        <div className="mt-2">
          <button
            type="button"
            disabled={!fileId || aiBusy}
            onClick={() => fileId && onAiExtract(fileId)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--party-primary)] bg-party-soft px-3 py-1.5 text-[13px] font-medium text-[var(--party-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiBusy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
            {aiBusy ? "识别中…(本地模型可能较慢,请稍候)" : fileId ? "AI 识别发票并自动填写" : "先上传发票再识别"}
          </button>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ sub, onDelete, deleting }: { sub: ReportSubmissionRow; onDelete: () => void; deleting: boolean }) {
  const baseChip = SUB_STATUS[sub.status] ?? { label: sub.status, bg: "#F1F5F9", color: "#64748B" };
  const chip = sub.status === "approved" && sub.autoApproved ? { ...baseChip, label: "已通过 · 自动" } : baseChip;
  const feeSource = sub.lines[0]?.feeSource ?? "";
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 px-4 py-2.5">
        <span className="text-xs text-gray-400">#{sub.seq}</span>
        <span className="font-medium text-gray-800">发票号 {sub.invoiceNo}</span>
        <span className="text-xs text-gray-400">{sub.purchaseDate?.slice(0, 10)}</span>
        <span className="text-sm font-medium text-[var(--party-primary)]">
          ¥{centsToYuan(sub.totalAmountCents + sub.totalTaxCents)} <span className="text-[11px] font-normal text-gray-400">含税</span>
        </span>
        {feeSource && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{feeSource}</span>}
        <span className="rounded-full px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: chip.bg, color: chip.color }}>
          {chip.label}
        </span>
        <div className="flex-1" />
        {(sub.status !== "approved" || sub.autoApproved) && (
          <button onClick={onDelete} disabled={deleting} title="删除该发票" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
            <Trash2Icon className="h-4 w-4" />
          </button>
        )}
      </div>
      {sub.supplier && (
        <div className="border-b border-gray-50 px-4 py-1 text-xs text-gray-500">销售方:{sub.supplier}</div>
      )}
      {sub.status === "returned" && sub.reviewNote && (
        <div className="border-b border-gray-50 bg-red-50 px-4 py-1.5 text-xs text-red-700">退回原因:{sub.reviewNote}</div>
      )}
      {sub.discrepancyNote && (
        <div className="border-b border-gray-50 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800">
          ⚠ 需重点审查(提交人已确认差异):{sub.discrepancyNote}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-400">
          <tr>
            <th className="px-4 py-1.5 font-medium">产品</th>
            <th className="px-4 py-1.5 font-medium">分类</th>
            <th className="px-4 py-1.5 font-medium">产地</th>
            <th className="px-4 py-1.5 text-right font-medium">含税金额(元)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sub.lines.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-1.5 text-gray-800">
                {l.productName}
                {l.spec && <span className="ml-1 text-[11px] text-gray-400">{l.spec}</span>}
              </td>
              <td className="px-4 py-1.5 text-gray-500">{l.category}</td>
              <td className="px-4 py-1.5 text-gray-500">{l.origin}</td>
              <td className="px-4 py-1.5 text-right text-gray-700">{centsToYuan(l.amountCents + l.taxCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
