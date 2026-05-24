import { useEffect, useMemo, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  SendIcon,
  Loader2Icon,
  FileTextIcon,
  CameraIcon,
  UploadIcon,
  SparklesIcon,
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
import { toast } from "sonner";
import {
  certificateIssueApi,
  certificateTemplateApi,
  type CertificateTemplateDto,
  type IssueCertificateInput,
  type ExtractHonorResponse,
  type ExtractedHonor,
} from "@/features/certificate";
import { generateCertificatePdfDataUrl } from "../lib/certificatePdf";
import { isValidYearLabel } from "../lib/certificateNumber";
import type { DesignerState } from "../lib/designerTypes";

const PARTY = "var(--party-primary)";

/* ─── Wizard 状态 ─── */

type WizardStep = 1 | 2 | 3 | 4;

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

  const [step, setStep] = useState<WizardStep>(1);

  /* ─── 步骤 1 状态 ─── */
  const [extractResult, setExtractResult] = useState<ExtractHonorResponse | null>(null);
  const [selectedHonorIdx, setSelectedHonorIdx] = useState<number>(-1);
  /** true 表示用户走「跳过 AI」手动模式,extractResult 保持 null */
  const [manualMode, setManualMode] = useState(false);

  /* ─── 步骤 2 状态 ─── */
  const [template, setTemplate] = useState<CertificateTemplateDto | null>(null);
  const [yearLabel, setYearLabel] = useState(String(new Date().getFullYear()));
  const [issuingOrgName, setIssuingOrgName] = useState("");

  /* ─── 步骤 3 状态 ─── */
  const [rows, setRows] = useState<RecipientRow[]>([newRow()]);

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
    const map: Record<WizardStep, string | null> = {
      1: null,
      2: !template
        ? "请选择证书模板"
        : !template.honorCode
          ? "该模板未设置荣誉首字母代码(honorCode),请到模板编辑页补填"
          : !isValidYearLabel(yearLabel)
            ? "年份段格式不正确"
            : null,
      3:
        rows.length === 0 || rows.every((r) => !r.name.trim())
          ? "至少添加 1 位受表彰对象"
          : null,
      4: null,
    };
    return map[step];
  }, [step, template, yearLabel, rows]);

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
                selectedHonorIdx={selectedHonorIdx}
                onSelectHonor={setSelectedHonorIdx}
                onExtractDone={(r) => {
                  setExtractResult(r);
                  if (r.honors.length === 1) {
                    // 单 honor 不必让用户选,自动选中
                    setSelectedHonorIdx(0);
                  } else {
                    setSelectedHonorIdx(-1);
                  }
                }}
                onSkipAI={() => {
                  setExtractResult(null);
                  setSelectedHonorIdx(-1);
                  commitStep1(null, -1);
                }}
                onContinueWithHonor={() => {
                  if (extractResult && selectedHonorIdx >= 0) {
                    commitStep1(extractResult, selectedHonorIdx);
                  }
                }}
                onGoExternal={() => navigate("/admin/certificates/external")}
              />
            )}

            {step === 2 && (
              <Step2Template
                template={template}
                onTemplateChange={setTemplate}
                yearLabel={yearLabel}
                onYearChange={setYearLabel}
                issuingOrgName={issuingOrgName}
                onIssuingOrgChange={setIssuingOrgName}
                suggestion={selectedHonor}
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
                  onClick={() => setStep((s) => (Math.min(4, s + 1) as WizardStep))}
                  disabled={Boolean(stepReady) || (step === 1 && !manualMode && !selectedHonor)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: PARTY }}
                  title={
                    step === 1 && !manualMode && !selectedHonor
                      ? "请先上传文件或选择「跳过 AI」"
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

/* ─── 步骤 1:上传 / 录入 ─── */

function Step1Upload({
  extractResult,
  selectedHonorIdx,
  onSelectHonor,
  onExtractDone,
  onSkipAI,
  onContinueWithHonor,
  onGoExternal,
}: {
  extractResult: ExtractHonorResponse | null;
  selectedHonorIdx: number;
  onSelectHonor: (i: number) => void;
  onExtractDone: (r: ExtractHonorResponse) => void;
  onSkipAI: () => void;
  onContinueWithHonor: () => void;
  onGoExternal: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const extractMut = useMutation({
    mutationFn: (f: File) => certificateIssueApi.extract(f),
    onSuccess: (r) => {
      if (r.honors.length === 0) {
        toast.warning("AI 未识别到任何荣誉项,请检查文件内容或人工填写");
      } else {
        toast.success(
          `提取完成:${r.honors.length} 项荣誉,共 ${r.honors.reduce(
            (s, h) => s + h.recipients.length,
            0,
          )} 位对象`,
        );
      }
      onExtractDone(r);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "提取失败"),
  });

  function handleFile(f: File) {
    extractMut.mutate(f);
  }

  if (extractResult) {
    return (
      <ExtractedResults
        result={extractResult}
        selectedHonorIdx={selectedHonorIdx}
        onSelectHonor={onSelectHonor}
        onReset={() => {
          if (fileInputRef.current) fileInputRef.current.value = "";
          // 让父组件用空 result 触发重置
          onExtractDone({
            honors: [],
            yearLabel: "",
            source: { fileName: "", bytes: 0, textLength: 0 },
          });
        }}
        onContinue={onContinueWithHonor}
      />
    );
  }

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">第一步 · 选择数据来源</h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        选择最贴合你场景的方式开始。AI 提取支持「两优一先」这种一个文件多个荣誉的情况。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 选项 A:上传文件 */}
        <UploadTile
          color="purple"
          icon={<FileTextIcon className="w-6 h-6" />}
          label="上传表彰文件"
          desc="Word / PDF · AI 抽取荣誉、年份、受表彰人员名单"
          loading={extractMut.isPending}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {/* 选项 B:拍照 */}
        <UploadTile
          color="blue"
          icon={<CameraIcon className="w-6 h-6" />}
          label="拍照录入证书"
          desc="OCR 暂未上线,敬请期待"
          disabled
        />

        {/* 选项 C:外部证书 */}
        <UploadTile
          color="amber"
          icon={<UploadIcon className="w-6 h-6" />}
          label="外部证书直接录入"
          desc="上传外部单位颁发的 PDF · 提取信息后入库审核"
          onClick={onGoExternal}
        />
      </div>

      <div className="mt-6 pt-4 border-t border-[#F0F0F0] flex items-center justify-between">
        <span className="text-xs text-[#9CA3AF]">不想用 AI? 也可以直接手动填表发证</span>
        <button
          type="button"
          onClick={onSkipAI}
          className="text-xs px-3 py-1.5 rounded border border-[#E9E9E9] hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          跳过 AI,手动填 →
        </button>
      </div>
    </div>
  );
}

function UploadTile({
  color,
  icon,
  label,
  desc,
  onClick,
  disabled,
  loading,
}: {
  color: "purple" | "blue" | "amber";
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = {
    purple: "from-purple-50 to-blue-50 border-purple-200 hover:border-purple-400 text-purple-600",
    blue: "from-blue-50 to-cyan-50 border-blue-200 hover:border-blue-400 text-blue-600",
    amber: "from-amber-50 to-orange-50 border-amber-200 hover:border-amber-400 text-amber-700",
  }[color];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`bg-gradient-to-br ${colors} border-2 rounded-lg p-5 text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="w-11 h-11 rounded-lg bg-white/80 flex items-center justify-center mb-3">
        {loading ? <Loader2Icon className="w-6 h-6 animate-spin" /> : icon}
      </div>
      <div className="text-sm font-bold text-[#1A1A1A] mb-1">{label}</div>
      <div className="text-[11px] text-[#6B7280] leading-relaxed">{desc}</div>
    </button>
  );
}

/* ─── 步骤 1 子组件:提取结果(单 honor 自动选,多 honor 让用户挑) ─── */

function ExtractedResults({
  result,
  selectedHonorIdx,
  onSelectHonor,
  onReset,
  onContinue,
}: {
  result: ExtractHonorResponse;
  selectedHonorIdx: number;
  onSelectHonor: (i: number) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  // 父组件可能传入空 result 表示要重置(避免维护两套 reset 路径)
  if (result.honors.length === 0 && !result.source.fileName) {
    return null;
  }

  const multi = result.honors.length > 1;
  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1 flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-purple-500" />
        AI 提取完成
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-xs font-normal text-[#9CA3AF] hover:text-red-600"
        >
          重新上传
        </button>
      </h2>
      <p className="text-xs text-[#9CA3AF] mb-3">
        源:{result.source.fileName} · {result.source.textLength} 字
        {result.source.completionTokens
          ? ` · 用量 ${result.source.promptTokens ?? "?"}+${result.source.completionTokens} tokens`
          : ""}
      </p>

      <div className="rounded-lg bg-[#F7F8FA] p-3 mb-4 text-xs grid grid-cols-2 gap-2">
        <InfoLine label="文件级年份" value={result.yearLabel || "—"} mono />
        <InfoLine label="文件级颁发日期" value={result.issueDate || "—"} mono />
      </div>

      {result.honors.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <AlertCircleIcon className="w-6 h-6 mx-auto text-amber-500 mb-1" />
          <div className="text-sm text-amber-900">未识别到任何荣誉项</div>
          <div className="text-[11px] text-amber-700 mt-1">
            可点「重新上传」换一份文件,或返回「跳过 AI」手动填
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">
              {multi ? (
                <>
                  发现 <span className="text-[var(--party-primary)]">{result.honors.length}</span>{" "}
                  项荣誉 — 请选择本次要发的一项
                </>
              ) : (
                "识别到 1 项荣誉"
              )}
            </h3>
            <span className="text-[11px] text-[#9CA3AF]">
              本次只发选中项;其余可后续重新进入向导发证
            </span>
          </div>

          <div className="space-y-2">
            {result.honors.map((h, i) => {
              const active = i === selectedHonorIdx;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => onSelectHonor(i)}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                    active
                      ? "border-[var(--party-primary)] bg-party-soft"
                      : "border-[#E9E9E9] hover:border-[#CBD5E1] bg-white"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        active
                          ? "bg-[var(--party-primary)] text-white"
                          : "border border-[#CBD5E1]"
                      }`}
                    >
                      {active && <CheckIcon className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#1A1A1A]">{h.honorName}</div>
                      {h.issuingOrg && (
                        <div className="text-[11px] text-[#6B7280] mt-0.5">
                          颁发机构:{h.issuingOrg}
                        </div>
                      )}
                      <div className="mt-1.5 text-[11px] text-[#9CA3AF]">
                        受表彰对象 {h.recipients.length} 位
                        {h.recipients.length > 0 && (
                          <span className="ml-2 font-mono text-[#6B7280]">
                            {h.recipients
                              .slice(0, 5)
                              .map((r) => r.name)
                              .join("、")}
                            {h.recipients.length > 5 && ` 等`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedHonorIdx >= 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onContinue}
                className="flex items-center gap-1 px-4 py-2 rounded text-sm font-medium text-white"
                style={{ backgroundColor: "var(--party-primary)" }}
              >
                确认并进入下一步
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InfoLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-[#9CA3AF]">{label}</span>
      <span className={`text-[#1A1A1A] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

/* ─── 步骤 2:选证书模板 ─── */

function Step2Template({
  template,
  onTemplateChange,
  yearLabel,
  onYearChange,
  issuingOrgName,
  onIssuingOrgChange,
  suggestion,
}: {
  template: CertificateTemplateDto | null;
  onTemplateChange: (t: CertificateTemplateDto | null) => void;
  yearLabel: string;
  onYearChange: (v: string) => void;
  issuingOrgName: string;
  onIssuingOrgChange: (v: string) => void;
  suggestion: ExtractedHonor | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });
  const templates = data ?? [];

  // AI 自动匹配建议(发现荣誉名包含 template.name 或 honorCode)
  const matched = useMemo(() => {
    if (!suggestion) return null;
    const hn = suggestion.honorName.toLowerCase();
    return (
      templates.find((t) => {
        if (!t.honorCode) return false;
        return (
          hn.includes(t.name.toLowerCase()) ||
          hn.includes(t.honorCode.toLowerCase()) ||
          t.name.toLowerCase().includes(hn)
        );
      }) ?? null
    );
  }, [suggestion, templates]);

  // 自动应用 AI 建议:首次进入 step 2 且 template 为 null 且 AI 找到匹配 → 自动选中
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (!autoAppliedRef.current && !template && matched) {
      autoAppliedRef.current = true;
      onTemplateChange(matched);
    }
  }, [matched, template, onTemplateChange]);

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">第二步 · 选择证书模板</h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        模板决定了证书外观、变量字段和荣誉首字母代码(用于编号)。
      </p>

      {suggestion && (
        <div className="mb-4 rounded-md bg-purple-50 border border-purple-200 text-purple-900 text-xs px-3 py-2 flex items-start gap-2">
          <SparklesIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-600" />
          <div>
            AI 建议:本次发的是「
            <span className="font-bold">{suggestion.honorName}</span>」
            {matched ? (
              <>
                {" — "}已自动选中模板「<span className="font-bold">{matched.name}</span>」
                (honorCode = <span className="font-mono">{matched.honorCode}</span>)
              </>
            ) : (
              <>
                {" — "}未在你的模板库中找到匹配项,
                请手动选一个,或先去
                <Link
                  to="/admin/certificate-templates/new"
                  className="underline mx-1"
                  target="_blank"
                >
                  新建模板
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-[#9CA3AF] py-8">加载模板中…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E9E9E9] p-6 text-center">
          <p className="text-sm text-[#6B7280]">还没有可用模板</p>
          <Link
            to="/admin/certificate-templates/new"
            className="inline-block mt-2 text-xs text-[var(--party-primary)] hover:underline"
          >
            去新建一个 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => {
            const usable = Boolean(t.honorCode && t.honorCode.trim());
            const active = t.id === template?.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!usable}
                onClick={() => onTemplateChange(active ? null : t)}
                className={`relative text-left rounded-lg overflow-hidden border-2 transition-all ${
                  active
                    ? "border-[var(--party-primary)] shadow-md"
                    : usable
                      ? "border-[#E9E9E9] hover:border-[var(--party-primary)] hover:shadow"
                      : "border-[#F0F0F0] opacity-60 cursor-not-allowed"
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
                    <div className="absolute inset-0 flex items-center justify-center text-[#B5B9C0] text-[10px]">
                      暂无预览
                    </div>
                  )}
                  {usable && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--party-primary)] text-white">
                      {t.honorCode}
                    </span>
                  )}
                  {!usable && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
                      缺 honorCode
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <div className="text-xs font-medium text-[#1A1A1A] truncate" title={t.name}>
                    {t.name}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 年份 + 颁发机构 */}
      <div className="mt-6 grid grid-cols-2 gap-3 max-w-xl">
        <label className="block">
          <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
            年份段 *
          </span>
          <input
            type="text"
            value={yearLabel}
            onChange={(e) => onYearChange(e.target.value.trim())}
            placeholder="2024 或 2024-2025"
            className="w-full px-2 py-1.5 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
            颁发机构(可选)
          </span>
          <input
            type="text"
            value={issuingOrgName}
            onChange={(e) => onIssuingOrgChange(e.target.value)}
            placeholder={suggestion?.issuingOrg ?? "如:中共 XX 委员会"}
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
}

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
