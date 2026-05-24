/**
 * 证书发证向导(V3 Phase 6+):
 *  - Step 1 上传 / AI 抽取  (Step1Upload)
 *  - Step 2 建表彰记录       (Step2HonorRecords)
 *  - Step 3 per-record 受表彰对象录入(每条 record 一个子步骤,统一 Step3RecipientsForm 按 record.honorType 分支)
 *  - Step 4 预览 + 批量发证   (Phase 6 是简版:summary + 直接发;Phase 7 升级为 3 列含预览)
 *
 * 全程字段级 200ms 防抖写 localStorage,刷新不丢。
 */
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  SendIcon,
  Loader2Icon,
  UploadIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  AwardIcon,
  UsersIcon,
  ListChecksIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  Building2Icon,
} from "lucide-react";
import {
  certificateIssueApi,
  certificateTemplateApi,
  type CertificateTemplateDto,
  type IssueCertificateInput,
  type ExtractHonorResponse,
} from "@/features/certificate";
import { useAuth } from "@/stores/auth";
import { generateCertificatePdfDataUrl } from "../lib/certificatePdf";
import { isValidYearLabel } from "../lib/certificateNumber";
import type { DesignerState } from "../lib/designerTypes";
import {
  emptyDraft,
  loadDraft,
  clearDraft,
  useDebouncedDraft,
  type CertificateDraftV1,
  type CollectiveRow,
  type HonorRecord,
  type PersonRow,
  type WizardStep,
} from "../lib/certificateDraft";
import { Step1Upload } from "../components/issue/Step1Upload";
import { Step2HonorRecords } from "../components/issue/Step2HonorRecords";
import { Step3RecipientsForm } from "../components/issue/Step3RecipientsForm";

const PARTY = "var(--party-primary)";

interface IssueResult {
  /** 唯一 key:`${recordRid}-${recipientRid}` */
  key: string;
  /** 所属 record(按显示顺序的序号,便于结果表分组) */
  recordIndex: number;
  /** 当前条目对应的 record + recipient name 拼接,展示用 */
  name: string;
  ok: boolean;
  certNo?: string;
  reason?: string;
}

function todayChinese(): string {
  const d = new Date();
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
}

function formatChineseDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[1]}年${m[2]}月${m[3]}日`;
}

/** record 的有效收件人数(按类型取对应数组里非空的那些) */
function recipientCountOf(record: HonorRecord): number {
  return record.honorType === "collective"
    ? record.collectives.filter((c) => c.name.trim()).length
    : record.persons.filter((p) => p.name.trim()).length;
}

/* ─── 主 Wizard ─── */

export default function CertificateIssuePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── V3 草稿持久化 ─── */
  const { me } = useAuth();
  const userId = me?.id ?? null;
  const [draft, setDraft] = useState<CertificateDraftV1>(() => emptyDraft());
  const hydratedRef = useRef(false);

  const [step, setStep] = useState<WizardStep>(1);

  /* ─── 步骤 1 状态 ─── */
  const [extractResult, setExtractResult] = useState<ExtractHonorResponse | null>(null);
  /** true 表示用户走「跳过 AI」手动模式,extractResult 保持 null */
  const [manualMode, setManualMode] = useState(false);

  /* ─── 步骤 2 状态:多荣誉表彰记录 + 顶层共享字段 ─── */
  const [records, setRecords] = useState<HonorRecord[]>([]);
  const [yearLabel, setYearLabel] = useState(String(new Date().getFullYear()));
  const [issueDate, setIssueDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  /* ─── Step 3 子步骤索引(records 内 0-based) ─── */
  // 不持久化:进 step 3 时永远从 0 开始;刷新若 step=3 则也从 0 起,用户可以再点 Next 移动
  const [subStepIdx, setSubStepIdx] = useState(0);
  const clampedSubStepIdx = useMemo(
    () => Math.max(0, Math.min(subStepIdx, Math.max(0, records.length - 1))),
    [subStepIdx, records.length],
  );

  /* ─── 草稿 ↔ 内存状态双向同步 ─── */
  useEffect(() => {
    if (!userId || hydratedRef.current) return;
    const saved = loadDraft(userId);
    hydratedRef.current = true;
    if (!saved) return;
    setDraft(saved);
    setStep(saved.step);
    if (saved.extracted) setExtractResult(saved.extracted);
    if (saved.yearLabel) setYearLabel(saved.yearLabel);
    if (saved.issueDate) setIssueDate(saved.issueDate);
    if (Array.isArray(saved.records)) setRecords(saved.records);
    // step=3 刷新时复位到第 1 条 record(避免引用越界)
    if (saved.step === 3) setSubStepIdx(0);
  }, [userId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    setDraft((d) => ({
      ...d,
      step,
      extracted: extractResult,
      yearLabel,
      issueDate,
      records,
    }));
  }, [step, extractResult, yearLabel, issueDate, records]);

  useDebouncedDraft(userId, draft);

  /* ─── 模板列表(共享缓存) ─── */
  const templatesQuery = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });
  const allTemplates = templatesQuery.data ?? [];
  const templateById = useMemo(() => {
    const map = new Map<string, CertificateTemplateDto>();
    allTemplates.forEach((t) => map.set(t.id, t));
    return map;
  }, [allTemplates]);

  /* ─── 当前 step 3 焦点 record ─── */
  const currentRecord = records[clampedSubStepIdx] ?? null;
  const currentTemplate = currentRecord?.templateId
    ? templateById.get(currentRecord.templateId)
    : undefined;

  /* ─── 步骤 4 状态 ─── */
  const [issuing, setIssuing] = useState(false);
  const [results, setResults] = useState<IssueResult[]>([]);

  /** 总收件人数(全部 record 合并) */
  const totalRecipients = useMemo(
    () => records.reduce((sum, r) => sum + recipientCountOf(r), 0),
    [records],
  );

  /* ─── 校验 ─── */
  const stepReady = useMemo(() => {
    // Step 2:顶层共享字段 + 每条 record 必填
    const step2Err = (() => {
      if (!isValidYearLabel(yearLabel))
        return "表彰年度格式不正确(应为「2024」或「2024-2025」)";
      if (!issueDate) return "请选择表彰日期";
      if (records.length === 0) return "至少添加 1 条表彰记录";
      for (let i = 0; i < records.length; i++) {
        if (!records[i].templateId)
          return `第 ${i + 1} 条记录:请选择模板`;
      }
      return null;
    })();

    // Step 3:当前焦点 record 的收件人至少 1 个非空
    const step3Err = (() => {
      if (!currentRecord) return "没有可填的记录";
      if (currentRecord.honorType === "collective") {
        if (!currentRecord.collectives.some((c) => c.name.trim()))
          return "至少添加 1 个被表彰集体";
      } else {
        if (!currentRecord.persons.some((p) => p.name.trim()))
          return "至少添加 1 位受表彰人员";
      }
      return null;
    })();

    const map: Record<WizardStep, string | null> = {
      1: null,
      2: step2Err,
      3: step3Err,
      4: totalRecipients === 0 ? "没有待发证条目" : null,
    };
    return map[step];
  }, [step, currentRecord, records, yearLabel, issueDate, totalRecipients]);

  /* ─── 发证(双层循环:records → recipients) ─── */
  async function handleIssueAll() {
    if (issuing || results.length > 0) return;
    setIssuing(true);
    setResults([]);
    try {
      for (let ri = 0; ri < records.length; ri++) {
        const record = records[ri];
        const template = record.templateId
          ? templateById.get(record.templateId)
          : undefined;
        if (!template) {
          // 该 record 未选模板理论 stepReady 已经拦住,兜底跳过
          continue;
        }
        let designState: DesignerState;
        try {
          designState = JSON.parse(template.designJson) as DesignerState;
        } catch {
          // 模板 designJson 不合法 → 该 record 全部失败
          const fallback = collectRecipients(record);
          fallback.forEach((rec) => {
            setResults((prev) => [
              ...prev,
              {
                key: `${record.rid}-${rec.rid}`,
                recordIndex: ri,
                name: rec.name,
                ok: false,
                reason: "模板 designJson 解析失败",
              },
            ]);
          });
          continue;
        }
        const recipients = collectRecipients(record);
        const batchTotal = recipients.length;
        const issueDateCN = issueDate
          ? formatChineseDate(issueDate)
          : todayChinese();
        for (const rec of recipients) {
          const variableValues: Record<string, string> = {
            name: rec.name,
            issueDate: issueDateCN,
            certNo: "待生成",
          };
          if (rec.dept) variableValues.department = rec.dept;
          let result: IssueResult;
          try {
            const pdfData = await generateCertificatePdfDataUrl(
              designState,
              variableValues,
            );
            const input: IssueCertificateInput = {
              templateId: template.id,
              recipientUserId: rec.userId,
              recipientName: rec.name,
              recipientEmpNo: rec.empNo || undefined,
              recipientDept: rec.dept || undefined,
              yearLabel,
              batchTotal,
              variableData: JSON.stringify(variableValues),
              pdfData,
              issuingOrgName: template.issuingOrgName || undefined,
              honorType: record.honorType,
              issueDate,
            };
            const cert = await certificateIssueApi.issue(input);
            result = {
              key: `${record.rid}-${rec.rid}`,
              recordIndex: ri,
              name: rec.name,
              ok: true,
              certNo: cert.certNo,
            };
          } catch (e) {
            result = {
              key: `${record.rid}-${rec.rid}`,
              recordIndex: ri,
              name: rec.name,
              ok: false,
              reason: e instanceof Error ? e.message : String(e),
            };
          }
          setResults((prev) => [...prev, result]);
        }
      }
    } finally {
      setIssuing(false);
      qc.invalidateQueries({ queryKey: ["certificates"] });
    }
  }

  const finishedAllOk =
    !issuing &&
    results.length === totalRecipients &&
    results.length > 0 &&
    results.every((r) => r.ok);

  /* 全部成功 → 清掉草稿 */
  useEffect(() => {
    if (finishedAllOk && userId) clearDraft(userId);
  }, [finishedAllOk, userId]);

  /* ─── Step 1 提交(commitStep1) ─── */
  function commitStep1(extract: ExtractHonorResponse | null) {
    setExtractResult(extract);
    setManualMode(!extract);
    if (extract && extract.yearLabel) setYearLabel(extract.yearLabel);
    if (extract && extract.issueDate) setIssueDate(extract.issueDate);
    setStep(2);
  }

  /* ─── 导航 ─── */
  function goNext() {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setSubStepIdx(0);
      setStep(3);
      return;
    }
    if (step === 3) {
      if (clampedSubStepIdx < records.length - 1) {
        setSubStepIdx(clampedSubStepIdx + 1);
      } else {
        setStep(4);
      }
      return;
    }
  }

  function goPrev() {
    if (step === 4) {
      setSubStepIdx(Math.max(0, records.length - 1));
      setStep(3);
      return;
    }
    if (step === 3) {
      if (clampedSubStepIdx > 0) {
        setSubStepIdx(clampedSubStepIdx - 1);
      } else {
        setStep(2);
      }
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <Link
          to="/admin/certificates"
          className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          已发证书
        </Link>
        <div className="w-px h-5 bg-[#E9E9E9]" />
        <SendIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">发证向导</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            上传文件 → AI 抽取信息(可跳过)→ 选证书模板 → 逐条录入受表彰对象 → 一键发证
          </p>
        </div>
      </header>

      {/* 主体:左 stepper + 右 step 内容 */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-[260px_1fr]">
        <Stepper
          step={step}
          subStepIdx={clampedSubStepIdx}
          records={records}
          templates={allTemplates}
          onJumpToSubStep={(idx) => {
            // 允许点击已 done 的子步骤跳回去修改;pending 的不让跳
            if (step !== 3) return;
            if (idx <= clampedSubStepIdx) setSubStepIdx(idx);
          }}
        />

        <div className="overflow-auto p-6 flex flex-col">
          <div className="flex-1">
            {step === 1 && (
              <Step1Upload
                extractResult={extractResult}
                onExtractDone={(r) => setExtractResult(r)}
                onReset={() => setExtractResult(null)}
                onSkipAI={() => commitStep1(null)}
              />
            )}

            {step === 2 && (
              <Step2HonorRecords
                records={records}
                onRecordsChange={setRecords}
                yearLabel={yearLabel}
                onYearLabelChange={setYearLabel}
                issueDate={issueDate}
                onIssueDateChange={setIssueDate}
                extracted={extractResult}
              />
            )}

            {step === 3 && currentRecord && (
              <Step3RecipientsForm
                record={currentRecord}
                template={currentTemplate}
                onRecordChange={(newRecord) =>
                  setRecords((prev) =>
                    prev.map((r) => (r.rid === newRecord.rid ? newRecord : r)),
                  )
                }
                recordIndex={clampedSubStepIdx}
                totalRecords={records.length}
              />
            )}

            {step === 4 && (
              <Step4PreviewIssue
                records={records}
                templates={templateById}
                yearLabel={yearLabel}
                issueDate={issueDate}
                results={results}
                issuing={issuing}
                totalRecipients={totalRecipients}
                onIssueAll={handleIssueAll}
              />
            )}

            {stepReady && step !== 1 && (
              <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
                {stepReady}
              </div>
            )}
          </div>

          {/* 底部导航 */}
          <div className="mt-6 flex items-center justify-between pt-4 border-t border-[#E9E9E9]">
            <div className="text-[11px] text-[#9CA3AF]">
              {step === 1
                ? "选择数据来源开始"
                : step === 2
                  ? `${records.length} 条表彰记录`
                  : step === 3 && currentRecord
                    ? `第 ${clampedSubStepIdx + 1} / ${records.length} 条 · ${recipientCountOf(currentRecord)} 个收件人`
                    : `共 ${totalRecipients} 张待发证`}
            </div>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={goPrev}
                  disabled={issuing}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA] disabled:opacity-50"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  上一步
                </button>
              )}
              {step < 4 && (
                <button
                  onClick={goNext}
                  disabled={
                    Boolean(stepReady) ||
                    (step === 1 &&
                      !manualMode &&
                      (!extractResult || extractResult.honors.length === 0))
                  }
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: PARTY }}
                  title={
                    step === 1 &&
                    !manualMode &&
                    (!extractResult || extractResult.honors.length === 0)
                      ? "请先上传表彰文件或选择「跳过 AI」"
                      : (stepReady ?? "")
                  }
                >
                  下一步
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              )}
              {step === 4 && (
                <>
                  {finishedAllOk && (
                    <button
                      onClick={() => navigate("/admin/certificates")}
                      className="px-3 py-1.5 rounded text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft"
                    >
                      去列表查看
                    </button>
                  )}
                  <button
                    onClick={handleIssueAll}
                    disabled={
                      issuing ||
                      totalRecipients === 0 ||
                      results.length > 0
                    }
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: PARTY }}
                  >
                    {issuing ? (
                      <>
                        <Loader2Icon className="w-4 h-4 animate-spin" />
                        发证中…
                      </>
                    ) : (
                      <>
                        <SendIcon className="w-4 h-4" />
                        {results.length > 0
                          ? "已完成"
                          : `全部发证 (${totalRecipients})`}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 把 record 折成可发证的扁平 recipient 列表(集体 → CollectiveRow,个人 → PersonRow)。
 * 过滤空姓名;返回每条的统一形态。
 */
function collectRecipients(record: HonorRecord): Array<{
  rid: string;
  name: string;
  empNo: string;
  dept: string;
  userId?: string;
}> {
  if (record.honorType === "collective") {
    return record.collectives
      .filter((c) => c.name.trim())
      .map((c) => ({
        rid: c.rid,
        name: c.name.trim(),
        empNo: "",
        dept: "",
      }));
  }
  return record.persons
    .filter((p) => p.name.trim())
    .map((p) => ({
      rid: p.rid,
      name: p.name.trim(),
      empNo: p.empNo.trim(),
      dept: p.dept.trim(),
      userId: p.userId,
    }));
}

/* ─── 左侧 Stepper ─── */

type StepperStatus = "done" | "active" | "pending";

interface StepperItem {
  key: string;
  badge: string;
  label: string;
  /** desc 行;若 typeChip 存在则在 desc 后追加色块 */
  desc: string;
  icon: typeof UploadIcon;
  status: StepperStatus;
  /** 集体/个人色块,用于 step 3 的子步骤 */
  typeChip?: "collective" | "individual";
  /** 子步骤可跳的索引(0-based,仅用于 step 3) */
  jumpIdx?: number;
}

const SUB_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function Stepper({
  step,
  subStepIdx,
  records,
  templates,
  onJumpToSubStep,
}: {
  step: WizardStep;
  subStepIdx: number;
  records: HonorRecord[];
  templates: CertificateTemplateDto[];
  onJumpToSubStep: (idx: number) => void;
}) {
  const items: StepperItem[] = [];

  items.push({
    key: "1",
    badge: "1",
    label: "荣誉文件上传",
    desc: "Word / PDF · AI 自动识别",
    icon: UploadIcon,
    status: step === 1 ? "active" : step > 1 ? "done" : "pending",
  });
  items.push({
    key: "2",
    badge: "2",
    label: "选证书模板",
    desc: "建立表彰记录,挑模板",
    icon: AwardIcon,
    status: step === 2 ? "active" : step > 2 ? "done" : "pending",
  });

  // Step 3:per-record 子步骤
  if (records.length === 0) {
    items.push({
      key: "3-placeholder",
      badge: "3",
      label: "录入对象",
      desc: "待 Step 2 决定记录",
      icon: UsersIcon,
      status: step === 3 ? "active" : step > 3 ? "done" : "pending",
    });
  } else {
    records.forEach((r, i) => {
      const t = r.templateId
        ? templates.find((tt) => tt.id === r.templateId)
        : undefined;
      const label = r.honorName || t?.name || `第 ${i + 1} 条`;
      const status: StepperStatus =
        step < 3
          ? "pending"
          : step > 3
            ? "done"
            : i < subStepIdx
              ? "done"
              : i === subStepIdx
                ? "active"
                : "pending";
      items.push({
        key: `3-${i}`,
        badge: `3${SUB_LETTERS[i] ?? String(i + 1)}`,
        label,
        desc:
          r.honorType === "collective"
            ? "集体录入"
            : "个人粘贴 / 识别",
        icon: r.honorType === "collective" ? Building2Icon : UsersIcon,
        status,
        typeChip: r.honorType,
        jumpIdx: i,
      });
    });
  }

  items.push({
    key: "4",
    badge: String(records.length === 0 ? 4 : 4),
    label: "清单 + 发证",
    desc: "最终确认并批量发证",
    icon: ListChecksIcon,
    status: step === 4 ? "active" : "pending",
  });

  return (
    <aside className="bg-white border-r border-[#E9E9E9] p-4 flex flex-col gap-1.5 overflow-auto">
      {items.map((it, i) => {
        const done = it.status === "done";
        const active = it.status === "active";
        const Icon = it.icon;
        const clickable =
          step === 3 && it.jumpIdx !== undefined && it.jumpIdx <= subStepIdx;
        const chipBg =
          it.typeChip === "collective"
            ? "bg-blue-100 text-blue-700 border-blue-200"
            : "bg-orange-100 text-orange-700 border-orange-200";
        return (
          <div key={it.key} className="relative">
            <div
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => {
                if (clickable && it.jumpIdx !== undefined) {
                  onJumpToSubStep(it.jumpIdx);
                }
              }}
              className={`flex items-start gap-3 rounded-lg p-3 transition-all ${
                active
                  ? "bg-party-soft border border-[var(--party-primary)]"
                  : done
                    ? "border border-transparent"
                    : "border border-transparent opacity-50"
              } ${clickable && !active ? "cursor-pointer hover:bg-[#F7F8FA]" : ""}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                      ? "bg-[var(--party-primary)] text-white"
                      : "bg-[#E9E9E9] text-[#9CA3AF]"
                }`}
              >
                {done ? <CheckIcon className="w-3.5 h-3.5" /> : it.badge}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-semibold flex items-center gap-1.5 ${
                    active ? "text-[var(--party-primary)]" : "text-[#1A1A1A]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                  <span className="truncate" title={it.label}>
                    {it.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-[#9CA3AF] truncate">
                    {it.desc}
                  </span>
                  {it.typeChip && (
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded border font-semibold flex-shrink-0 ${chipBg}`}
                    >
                      {it.typeChip === "collective" ? "集体" : "个人"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {i < items.length - 1 && (
              <div className="absolute left-[1.625rem] top-[3rem] w-px h-3 bg-[#E9E9E9]" />
            )}
          </div>
        );
      })}
    </aside>
  );
}

/* ─── Step 4 简版 ─── */

function Step4PreviewIssue({
  records,
  templates,
  yearLabel,
  issueDate,
  results,
  issuing,
  totalRecipients,
  onIssueAll,
}: {
  records: HonorRecord[];
  templates: Map<string, CertificateTemplateDto>;
  yearLabel: string;
  issueDate: string;
  results: IssueResult[];
  issuing: boolean;
  totalRecipients: number;
  onIssueAll: () => void;
}) {
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const pct = totalRecipients
    ? Math.round((results.length / totalRecipients) * 100)
    : 0;

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">
        第四步 · 清单 + 一键发证
      </h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        共 {records.length} 条表彰记录,合计 {totalRecipients} 张待发证。
        每条 record 一个 batch,certNo 各自从 001 起编号。
        <span className="ml-2">表彰年度:</span>
        <span className="font-mono text-[#1A1A1A]">{yearLabel}</span>
        <span className="ml-2">表彰日期:</span>
        <span className="font-mono text-[#1A1A1A]">{issueDate}</span>
      </p>

      {/* 进度 */}
      {(issuing || results.length > 0) && (
        <div className="rounded-lg bg-white border border-[#E9E9E9] p-3 mb-4">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-medium text-[#1A1A1A]">
              {issuing ? "发证中…" : "完成"}
            </span>
            <span className="text-[#6B7280] font-mono">
              {results.length} / {totalRecipients}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#F0F0F0] overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-[var(--party-primary)] to-[var(--party-accent)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs">
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

      {/* 按 record 分组展示 */}
      <div className="space-y-4">
        {records.map((record, ri) => {
          const t = record.templateId
            ? templates.get(record.templateId)
            : undefined;
          const recordResults = results.filter((r) => r.recordIndex === ri);
          const isCollective = record.honorType === "collective";
          const headerColor = isCollective
            ? "bg-blue-50 border-blue-200"
            : "bg-orange-50 border-orange-200";
          const recipientCount = isCollective
            ? record.collectives.filter((c) => c.name.trim()).length
            : record.persons.filter((p) => p.name.trim()).length;
          return (
            <div
              key={record.rid}
              className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white"
            >
              <div
                className={`px-3 py-2 border-b border-[#E9E9E9] flex items-center gap-3 ${headerColor}`}
              >
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                    isCollective
                      ? "bg-blue-100 text-blue-700 border-blue-300"
                      : "bg-orange-100 text-orange-700 border-orange-300"
                  }`}
                >
                  {isCollective ? "集体" : "个人"}
                </span>
                <span className="text-sm font-semibold text-[#1A1A1A] truncate">
                  {record.honorName || t?.name || "未命名"}
                </span>
                <span className="text-[11px] text-[#6B7280]">
                  · 模板 {t?.name ?? "?"} ·{" "}
                  <span className="font-mono">{t?.honorCode ?? "?"}</span> ·{" "}
                  {recipientCount} 张
                </span>
              </div>
              {isCollective ? (
                <CollectiveResultTable
                  collectives={record.collectives.filter((c) => c.name.trim())}
                  recordRid={record.rid}
                  recordResults={recordResults}
                />
              ) : (
                <PersonResultTable
                  persons={record.persons.filter((p) => p.name.trim())}
                  recordRid={record.rid}
                  recordResults={recordResults}
                />
              )}
            </div>
          );
        })}
      </div>

      {!issuing && results.length === 0 && (
        <p className="mt-4 text-[10px] text-[#9CA3AF] text-center">
          点底部「全部发证」开始 · 单张失败不影响其他继续发 ·
          发完后可去「已发证书」批量下载 PDF
        </p>
      )}

      {!onIssueAll && null /* 防 lint 把 prop 当 unused */}
    </div>
  );
}

/* ─── Step 4 result tables(按类型拆开,让 TS 准确推断行字段) ─── */

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
      失败:{(res.reason ?? "").slice(0, 40)}
    </span>
  );
}

function CollectiveResultTable({
  collectives,
  recordRid,
  recordResults,
}: {
  collectives: CollectiveRow[];
  recordRid: string;
  recordResults: IssueResult[];
}) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-[#F7F8FA]">
        <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
          <th className="px-3 py-1.5 text-left w-10">#</th>
          <th className="px-3 py-1.5 text-left">集体名</th>
          <th className="px-3 py-1.5 text-left">证书编号 / 状态</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F0F0F0]">
        {collectives.map((c, i) => {
          const res = recordResults.find(
            (r) => r.key === `${recordRid}-${c.rid}`,
          );
          return (
            <tr key={c.rid}>
              <td className="px-3 py-1.5 text-[#9CA3AF] font-mono">{i + 1}</td>
              <td className="px-3 py-1.5 text-[#1A1A1A]">{c.name}</td>
              <td className="px-3 py-1.5">
                <StatusCell res={res} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PersonResultTable({
  persons,
  recordRid,
  recordResults,
}: {
  persons: PersonRow[];
  recordRid: string;
  recordResults: IssueResult[];
}) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-[#F7F8FA]">
        <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
          <th className="px-3 py-1.5 text-left w-10">#</th>
          <th className="px-3 py-1.5 text-left">姓名</th>
          <th className="px-3 py-1.5 text-left w-28">员工编号</th>
          <th className="px-3 py-1.5 text-left">部门</th>
          <th className="px-3 py-1.5 text-left">证书编号 / 状态</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F0F0F0]">
        {persons.map((p, i) => {
          const res = recordResults.find(
            (r) => r.key === `${recordRid}-${p.rid}`,
          );
          return (
            <tr key={p.rid}>
              <td className="px-3 py-1.5 text-[#9CA3AF] font-mono">{i + 1}</td>
              <td className="px-3 py-1.5 text-[#1A1A1A]">{p.name}</td>
              <td className="px-3 py-1.5 font-mono text-[#6B7280]">
                {p.empNo || "—"}
              </td>
              <td className="px-3 py-1.5 text-[#6B7280]">{p.dept || "—"}</td>
              <td className="px-3 py-1.5">
                <StatusCell res={res} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
