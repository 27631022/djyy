import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  PlusIcon,
  XIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from "lucide-react";
import {
  certificateIssueApi,
  certificateTemplateApi,
  type CertificateTemplateDto,
  type IssueCertificateInput,
  type ExtractHonorResponse,
  type ExtractedHonor,
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
  type HonorRecord,
  type WizardStep,
} from "../lib/certificateDraft";
import { Step1Upload } from "../components/issue/Step1Upload";
import { Step2HonorRecords } from "../components/issue/Step2HonorRecords";

const PARTY = "var(--party-primary)";

/* ─── Wizard 状态 ─── */
// WizardStep 类型已迁到 lib/certificateDraft.ts(Phase 2),这里 import 复用

interface RecipientRow {
  /** 行内 key,前端 useId 用 */
  rid: string;
  name: string;
  empNo: string;
  dept: string;
}

function newRow(partial?: Partial<RecipientRow>): RecipientRow {
  return {
    rid: Math.random().toString(36).slice(2, 10),
    name: partial?.name ?? "",
    empNo: partial?.empNo ?? "",
    dept: partial?.dept ?? "",
  };
}

interface IssueResult {
  rid: string;
  name: string;
  ok: boolean;
  certNo?: string;
  reason?: string;
}

function todayChinese(): string {
  const d = new Date();
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
}

/* ─── 主 Wizard ─── */

export default function CertificateIssuePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── V3 草稿持久化 ─── */
  // 仅用 me.id 作 key,未登录时跳过持久化(用户应该不可能看到此页,但兜底防崩)
  const { me } = useAuth();
  const userId = me?.id ?? null;
  // 注意:首次渲染时 me 还在加载中,draft 暂用 empty;mount effect 里再 hydrate
  const [draft, setDraft] = useState<CertificateDraftV1>(() => emptyDraft());
  const hydratedRef = useRef(false);

  const [step, setStep] = useState<WizardStep>(1);

  /* ─── 步骤 1 状态 ─── */
  const [extractResult, setExtractResult] = useState<ExtractHonorResponse | null>(null);
  const [selectedHonorIdx, setSelectedHonorIdx] = useState<number>(-1);
  /** true 表示用户走「跳过 AI」手动模式,extractResult 保持 null */
  const [manualMode, setManualMode] = useState(false);

  /* ─── 步骤 2 状态(V3 新):多荣誉表彰记录 + 顶层共享字段 ─── */
  const [records, setRecords] = useState<HonorRecord[]>([]);
  /**
   * 表彰年度 + 表彰日期 — V3 中提升为 draft 顶层共享字段,
   * 同一份表彰文件下所有荣誉共用;Phase 5-7 完成前老 Step 3/4 也复用。
   */
  const [yearLabel, setYearLabel] = useState(String(new Date().getFullYear()));
  const [issueDate, setIssueDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  /* ─── 草稿 ↔ 内存状态双向同步 ─── */
  // 1) 首次拿到 userId 时,从 localStorage 拉旧 draft 恢复全部字段
  useEffect(() => {
    if (!userId || hydratedRef.current) return;
    const saved = loadDraft(userId);
    hydratedRef.current = true;
    if (!saved) return;
    setDraft(saved);
    setStep(saved.step);
    if (saved.extracted) {
      setExtractResult(saved.extracted);
      // 多 honor 时让用户重新选(避免老的 selectedHonorIdx 与新 list 错位)
      setSelectedHonorIdx(saved.extracted.honors.length === 1 ? 0 : -1);
    }
    if (saved.yearLabel) setYearLabel(saved.yearLabel);
    if (saved.issueDate) setIssueDate(saved.issueDate);
    if (Array.isArray(saved.records)) {
      setRecords(saved.records);
    }
  }, [userId]);

  // 2) 全部 V3 草稿字段变化 → 同步进 draft(由 useDebouncedDraft 200ms 后落盘)
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

  // 3) 防抖写 localStorage(useDebouncedDraft 内部已处理 userId 为 null 的情况)
  useDebouncedDraft(userId, draft);

  /* ─── 步骤 2/3/4 老状态(Phase 4-7 过渡桥接用,Phase 7 完成后撤掉) ─── */
  const [template, setTemplate] = useState<CertificateTemplateDto | null>(null);
  const [issuingOrgName, setIssuingOrgName] = useState("");

  /* ─── 步骤 3 状态 ─── */
  const [rows, setRows] = useState<RecipientRow[]>([newRow()]);

  /** 模板列表(供 Step 2 → Step 3 桥接 + 老 Step 4 元数据展示) */
  const templatesQuery = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });
  const allTemplates = templatesQuery.data ?? [];

  /**
   * Step 2 → Step 3 桥接:把 records[0] 摊平到老 single-honor 状态。
   *
   * 年份 + 日期已经是 draft 顶层共享字段,这里只需补 template + rows + issuingOrg。
   *
   * 临时方案 — Phase 5/6 给 Step 3a/3b 提供集体+个人各自的录入页后,
   * Phase 7 让 Step 4 直接消费 records[],届时此函数可以拿掉。
   */
  function bridgeRecordToOldState(record: HonorRecord) {
    if (record.templateId) {
      const t = allTemplates.find((tt) => tt.id === record.templateId);
      if (t) setTemplate(t);
    }
    // 个人 → rows;集体 → 暂用集体名作 row.name(Phase 5 会有专门的 collectives 录入)
    if (record.honorType === "individual") {
      setRows(
        record.persons.length > 0
          ? record.persons.map((p) =>
              newRow({ name: p.name, empNo: p.empNo, dept: p.dept }),
            )
          : [newRow()],
      );
    } else {
      setRows(
        record.collectives.length > 0
          ? record.collectives.map((c) => newRow({ name: c.name }))
          : [newRow()],
      );
    }
    // 颁发机构尝试从 extract 里取(records 没存这个字段,因为本来是模板/全局级)
    if (extractResult && extractResult.honors[0]?.issuingOrg) {
      setIssuingOrgName(extractResult.honors[0].issuingOrg);
    }
    // 老 selectedHonor 派生需要 idx,桥接后强制 0
    setSelectedHonorIdx(0);
  }

  /* ─── 步骤 4 状态 ─── */
  const [validUntil, setValidUntil] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [results, setResults] = useState<IssueResult[]>([]);

  const designState: DesignerState | null = useMemo(() => {
    if (!template) return null;
    try {
      return JSON.parse(template.designJson) as DesignerState;
    } catch {
      return null;
    }
  }, [template]);

  /** 当前选中的荣誉(为空时表示手动模式或还没选) */
  const selectedHonor: ExtractedHonor | null =
    extractResult && selectedHonorIdx >= 0
      ? extractResult.honors[selectedHonorIdx] ?? null
      : null;

  /* ─── 步骤 1 → 步骤 2 时执行:从 AI 提取结果填充后续状态 ─── */
  function commitStep1(extract: ExtractHonorResponse | null, honorIdx: number) {
    setExtractResult(extract);
    setSelectedHonorIdx(honorIdx);
    setManualMode(!extract);

    if (extract) {
      if (extract.yearLabel) setYearLabel(extract.yearLabel);
      const honor = extract.honors[honorIdx];
      if (honor) {
        if (honor.issuingOrg) setIssuingOrgName(honor.issuingOrg);
        // 填充 rows
        if (honor.recipients.length > 0) {
          setRows(honor.recipients.map((r) => newRow(r)));
        }
      }
    }
    setStep(2);
  }

  /* ─── 校验 ─── */
  const stepReady = useMemo(() => {
    // Step 2 (V3):顶层共享字段 + 每条 record
    const step2Err = (() => {
      if (!isValidYearLabel(yearLabel))
        return "表彰年度格式不正确(应为「2024」或「2024-2025」)";
      if (!issueDate) return "请选择表彰日期";
      if (records.length === 0) return "至少添加 1 条表彰记录";
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r.templateId) return `第 ${i + 1} 条记录:请选择模板`;
      }
      return null;
    })();

    const map: Record<WizardStep, string | null> = {
      1: null,
      2: step2Err,
      3:
        rows.length === 0 || rows.every((r) => !r.name.trim())
          ? "至少添加 1 位受表彰对象"
          : null,
      4: null,
    };
    return map[step];
  }, [step, records, rows, yearLabel, issueDate]);

  /* ─── 发证 ─── */
  const validRows = useMemo(() => rows.filter((r) => r.name.trim()), [rows]);

  async function issueOnce(row: RecipientRow, batchTotal: number): Promise<IssueResult> {
    if (!template || !designState)
      return { rid: row.rid, name: row.name, ok: false, reason: "模板未就绪" };
    if (!row.name.trim())
      return { rid: row.rid, name: "(空)", ok: false, reason: "姓名为空,跳过" };

    const variableValues: Record<string, string> = {
      name: row.name.trim(),
      issueDate: extractResult?.issueDate
        ? formatChineseDate(extractResult.issueDate)
        : todayChinese(),
      certNo: "待生成",
    };
    if (row.dept.trim()) variableValues.department = row.dept.trim();

    try {
      const pdfData = await generateCertificatePdfDataUrl(designState, variableValues);
      const input: IssueCertificateInput = {
        templateId: template.id,
        recipientName: row.name.trim(),
        recipientEmpNo: row.empNo.trim() || undefined,
        recipientDept: row.dept.trim() || undefined,
        yearLabel,
        batchTotal,
        variableData: JSON.stringify(variableValues),
        pdfData,
        validUntil: validUntil || undefined,
        issuingOrgName: issuingOrgName.trim() || undefined,
      };
      const cert = await certificateIssueApi.issue(input);
      return { rid: row.rid, name: row.name, ok: true, certNo: cert.certNo };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return { rid: row.rid, name: row.name, ok: false, reason };
    }
  }

  async function handleIssueAll() {
    if (!template) return;
    setIssuing(true);
    setResults([]);
    const batchTotal = validRows.length;
    for (const row of validRows) {
      const r = await issueOnce(row, batchTotal);
      setResults((prev) => [...prev, r]);
    }
    setIssuing(false);
    qc.invalidateQueries({ queryKey: ["certificates"] });
  }

  const finishedAllOk =
    !issuing &&
    results.length === validRows.length &&
    results.length > 0 &&
    results.every((r) => r.ok);

  /* ─── V3:全部成功 → 清掉草稿(避免下次进来还看到旧状态) ─── */
  useEffect(() => {
    if (finishedAllOk && userId) {
      clearDraft(userId);
    }
  }, [finishedAllOk, userId]);

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
            上传文件 → AI 抽取信息(可跳过)→ 选证书 → 确定人员 → 一键发证
          </p>
        </div>
      </header>

      {/* 主体:左 stepper + 右 step 内容 */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-[240px_1fr]">
        {/* 左侧 stepper */}
        <Stepper step={step} />

        {/* 右侧步骤内容 */}
        <div className="overflow-auto p-6 flex flex-col">
          <div className="flex-1">
            {step === 1 && (
              <Step1Upload
                extractResult={extractResult}
                onExtractDone={(r) => {
                  setExtractResult(r);
                  // Phase 3 过渡期:下游单 honor 流仍只用第 1 项;Phase 4 改 records[] 后此变量退场
                  setSelectedHonorIdx(r.honors.length > 0 ? 0 : -1);
                }}
                onReset={() => {
                  // 重置 = 清掉抽取结果,回到上传面板;effect 会把 draft.extracted 同步为 null
                  setExtractResult(null);
                  setSelectedHonorIdx(-1);
                }}
                onSkipAI={() => {
                  setExtractResult(null);
                  setSelectedHonorIdx(-1);
                  commitStep1(null, -1);
                }}
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

            {step === 3 && (
              <Step3Recipients
                rows={rows}
                onChange={setRows}
                fromAi={Boolean(selectedHonor)}
                honorName={selectedHonor?.honorName}
              />
            )}

            {step === 4 && (
              <Step4Confirm
                template={template}
                honorName={selectedHonor?.honorName}
                yearLabel={yearLabel}
                issuingOrgName={issuingOrgName}
                validUntil={validUntil}
                onValidUntilChange={setValidUntil}
                rows={validRows}
                results={results}
                issuing={issuing}
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
                : `共 ${validRows.length} 位待发证`}
            </div>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => (Math.max(1, s - 1) as WizardStep))}
                  disabled={issuing}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA] disabled:opacity-50"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  上一步
                </button>
              )}
              {step < 4 && (
                <button
                  onClick={() => {
                    if (step === 1) {
                      // 上一步抽取了内容 → 直接进 Step 2;Step 2 内有「AI 识别」按钮把
                      // extractResult.honors 灌成 records[]。手动模式则 step 2 空表起步。
                      setStep(2);
                      return;
                    }
                    if (step === 2) {
                      // Step 2 → Step 3 bridge:
                      // Phase 4 内仍用老 Step 3/4 单 honor 流,用 records[0] 桥接到旧
                      // template / yearLabel / rows / issuingOrgName。Phase 5-7 完成后撤掉此桥。
                      if (records.length > 0) {
                        bridgeRecordToOldState(records[0]);
                        if (records.length > 1) {
                          toast.info(
                            `本期只发第 1 项「${records[0].honorName || "未命名"}」 — 多荣誉一体发证将在 Phase 7 完成`,
                          );
                        }
                      }
                      setStep(3);
                      return;
                    }
                    setStep((s) => (Math.min(4, s + 1) as WizardStep));
                  }}
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
                      : stepReady ?? ""
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
                      validRows.length === 0 ||
                      !template ||
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
                        {results.length > 0 ? "已完成" : `全部发证 (${validRows.length})`}
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

/* ─── 左侧 Stepper ─── */

function Stepper({ step }: { step: WizardStep }) {
  const items = [
    { idx: 1 as WizardStep, label: "上传 / 录入", desc: "文件 / 拍照 / 外部证书", icon: UploadIcon },
    { idx: 2 as WizardStep, label: "选证书", desc: "确定使用哪个模板", icon: AwardIcon },
    { idx: 3 as WizardStep, label: "确定人员", desc: "审核 AI 抽取或手填", icon: UsersIcon },
    { idx: 4 as WizardStep, label: "清单 + 发证", desc: "最终确认并批量发证", icon: ListChecksIcon },
  ];
  return (
    <aside className="bg-white border-r border-[#E9E9E9] p-4 flex flex-col gap-1.5 overflow-auto">
      {items.map((it, i) => {
        const done = step > it.idx;
        const active = step === it.idx;
        const Icon = it.icon;
        return (
          <div key={it.idx} className="relative">
            <div
              className={`flex items-start gap-3 rounded-lg p-3 transition-all ${
                active
                  ? "bg-party-soft border border-[var(--party-primary)]"
                  : done
                    ? "border border-transparent"
                    : "border border-transparent opacity-50"
              }`}
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
                {done ? <CheckIcon className="w-3.5 h-3.5" /> : it.idx}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-semibold flex items-center gap-1.5 ${
                    active ? "text-[var(--party-primary)]" : "text-[#1A1A1A]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 opacity-70" />
                  {it.label}
                </div>
                <div className="text-[11px] text-[#9CA3AF] mt-0.5">{it.desc}</div>
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

/* ─── 步骤 1 已下沉到 ../components/issue/Step1Upload.tsx(Phase 3) ─── */

/* ─── 步骤 2 已下沉到 ../components/issue/Step2HonorRecords.tsx(Phase 4) ─── */

/* ─── 步骤 3:确定人员 ─── */

function Step3Recipients({
  rows,
  onChange,
  fromAi,
  honorName,
}: {
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  fromAi: boolean;
  honorName?: string;
}) {
  function patch(rid: string, p: Partial<RecipientRow>) {
    onChange(rows.map((r) => (r.rid === rid ? { ...r, ...p } : r)));
  }
  function remove(rid: string) {
    onChange(rows.filter((r) => r.rid !== rid));
  }
  function add() {
    onChange([...rows, newRow()]);
  }

  const validCount = rows.filter((r) => r.name.trim()).length;

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">第三步 · 确定受表彰人员</h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        {fromAi
          ? `AI 已从文件抽取了「${honorName ?? ""}」的受表彰名单。请人工核对、补全员工编号 / 部门后进入下一步。`
          : "添加本次发证的受表彰人员。点「+ 添加」加行,姓名为空的行会被忽略。"}
      </p>

      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA]">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left">姓名 *</th>
              <th className="px-2 py-2 text-left">员工编号</th>
              <th className="px-2 py-2 text-left">部门</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {rows.map((r, i) => (
              <tr key={r.rid}>
                <td className="px-2 py-1 text-[#9CA3AF] font-mono">{i + 1}</td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => patch(r.rid, { name: e.target.value })}
                    placeholder="姓名"
                    className="w-full px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={r.empNo}
                    onChange={(e) => patch(r.rid, { empNo: e.target.value })}
                    placeholder="可选"
                    className="w-full px-1.5 py-1 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={r.dept}
                    onChange={(e) => patch(r.rid, { dept: e.target.value })}
                    placeholder="可选"
                    className="w-full px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => remove(r.rid)}
                    disabled={rows.length === 1}
                    className="p-1 rounded text-[#9CA3AF] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-2 py-2 border-t border-[#F0F0F0] bg-[#FAFAFB] flex items-center justify-between">
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1 text-[11px] text-[var(--party-primary)] hover:underline"
          >
            <PlusIcon className="w-3 h-3" />
            添加一行
          </button>
          <span className="text-[10px] text-[#9CA3AF]">
            有效:{validCount} / {rows.length}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── 步骤 4:清单 + 发证 ─── */

function Step4Confirm({
  template,
  honorName,
  yearLabel,
  issuingOrgName,
  validUntil,
  onValidUntilChange,
  rows,
  results,
  issuing,
  onIssueAll,
}: {
  template: CertificateTemplateDto | null;
  honorName?: string;
  yearLabel: string;
  issuingOrgName: string;
  validUntil: string;
  onValidUntilChange: (v: string) => void;
  rows: RecipientRow[];
  results: IssueResult[];
  issuing: boolean;
  onIssueAll: () => void;
}) {
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const pct = rows.length ? Math.round((results.length / rows.length) * 100) : 0;

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">第四步 · 最终确认并发证</h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        核对清单,点「全部发证」一键生成 {rows.length} 张证书。同批次共享{" "}
        <span className="font-mono">{yearLabel}-{template?.honorCode ?? "?"}-{rows.length}</span>{" "}
        编号前缀,seq 自动 001~{String(rows.length).padStart(3, "0")}。
      </p>

      {/* 摘要卡 */}
      <div className="rounded-lg border border-[#E9E9E9] bg-white p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Summary label="模板" value={template?.name ?? "—"} />
        <Summary
          label="honorCode"
          value={template?.honorCode ?? "—"}
          mono
        />
        <Summary label="年份" value={yearLabel} mono />
        <Summary label="批次总数" value={String(rows.length)} mono />
        {honorName && <Summary label="荣誉" value={honorName} />}
        {issuingOrgName && <Summary label="颁发机构" value={issuingOrgName} />}
        <div>
          <div className="text-[10px] text-[#9CA3AF] mb-1">有效期至</div>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => onValidUntilChange(e.target.value)}
            disabled={issuing || results.length > 0}
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none disabled:bg-[#F7F8FA]"
          />
          <div className="text-[10px] text-[#9CA3AF] mt-0.5">留空=永久</div>
        </div>
      </div>

      {/* 进度 */}
      {(issuing || results.length > 0) && (
        <div className="rounded-lg bg-white border border-[#E9E9E9] p-3 mb-4">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-medium text-[#1A1A1A]">
              {issuing ? "发证中…" : "完成"}
            </span>
            <span className="text-[#6B7280] font-mono">
              {results.length} / {rows.length}
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

      {/* 清单表 */}
      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA]">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-3 py-2 text-left w-10">#</th>
              <th className="px-3 py-2 text-left">姓名</th>
              <th className="px-3 py-2 text-left">员工编号</th>
              <th className="px-3 py-2 text-left">部门</th>
              <th className="px-3 py-2 text-left">证书编号 / 状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {rows.map((r, i) => {
              const res = results.find((x) => x.rid === r.rid);
              return (
                <tr key={r.rid}>
                  <td className="px-3 py-2 text-[#9CA3AF] font-mono">{i + 1}</td>
                  <td className="px-3 py-2 text-[#1A1A1A]">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-[#6B7280]">{r.empNo || "—"}</td>
                  <td className="px-3 py-2 text-[#6B7280]">{r.dept || "—"}</td>
                  <td className="px-3 py-2">
                    {!res ? (
                      <span className="text-[#9CA3AF]">待发证</span>
                    ) : res.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 font-mono">
                        <CheckCircle2Icon className="w-3.5 h-3.5" />
                        {res.certNo}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-red-700"
                        title={res.reason}
                      >
                        <AlertCircleIcon className="w-3.5 h-3.5" />
                        失败:{(res.reason ?? "").slice(0, 40)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 一些隐藏的、可能后续展开的功能提示 */}
      {!issuing && results.length === 0 && (
        <p className="mt-3 text-[10px] text-[#9CA3AF] text-center">
          点底部「全部发证」开始 · 单张失败不影响其他继续发 · 发完后可去「已发证书」批量下载 PDF
        </p>
      )}

      {!onIssueAll && null /* 防 lint 把 prop 当 unused */}
    </div>
  );
}

function Summary({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-[#9CA3AF] mb-1">{label}</div>
      <div
        className={`text-[#1A1A1A] font-medium truncate ${mono ? "font-mono text-[var(--party-primary)]" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

/* ─── 工具 ─── */

function formatChineseDate(iso: string): string {
  // iso 形如 "2024-12-15" → "2024年12月15日"
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[1]}年${m[2]}月${m[3]}日`;
}
