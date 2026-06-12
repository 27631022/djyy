/**
 * 证书发证向导(V3 Phase 6+):
 *  - Step 1 上传 / AI 抽取   (Step1Upload)
 *  - Step 2 确认表彰公共信息  (Step2SharedInfo:年度/日期/有效期)
 *  - Step 3 选证书模板/建表彰记录 (Step2HonorRecords)
 *  - Step 4 per-record 受表彰对象录入(每条 record 一个子步骤,统一 Step3RecipientsForm 按 record.honorType 分支)
 *  - Step 5 预览 + 批量发证   (3 列含预览)
 *
 * 全程字段级 200ms 防抖写 localStorage,刷新不丢。
 */
import { useEffect, useMemo, useState } from "react";
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
  Building2Icon,
  CalendarDaysIcon,
} from "lucide-react";
import {
  certificateIssueApi,
  certificateTemplateApi,
  type CertificateTemplateDto,
  type ExtractHonorResponse,
} from "@/features/certificate";
import { useAuth } from "@/stores/auth";
import { generateCertificateUploadOutputs } from "../lib/certificatePdf";
import { storageApi } from "@/features/storage";
import { buildVariableValues } from "../lib/variableMapping";
import { isValidYearLabel } from "../lib/certificateNumber";
import type { DesignerState } from "../lib/designerTypes";
import {
  emptyDraft,
  loadDraft,
  clearDraft,
  flattenRecipients,
  useDebouncedDraft,
  defaultYearLabel,
  type CertificateDraftV1,
  type HonorRecord,
  type WizardStep,
} from "../lib/certificateDraft";
import { Step1Upload } from "../components/issue/Step1Upload";
import { Step2SharedInfo } from "../components/issue/Step2SharedInfo";
import { Step2HonorRecords } from "../components/issue/Step2HonorRecords";
import { Step3RecipientsForm } from "../components/issue/Step3RecipientsForm";
import {
  Step4PreviewIssue,
  type IssueResult,
} from "../components/issue/Step4PreviewIssue";

const PARTY = "var(--party-primary)";

/** record 的有效收件人数(按类型取对应数组里非空的那些) */
function recipientCountOf(record: HonorRecord): number {
  return record.honorType === "collective"
    ? record.collectives.filter((c) => c.name.trim()).length
    : record.persons.filter((p) => p.name.trim()).length;
}

/* ─── 主 Wizard ─── */

/** 外壳:等 auth 拿到 userId 后以 key 重挂载向导 —— 草稿在向导的 useState 初始化器里一次读入,零 effect 同步 */
export default function CertificateIssuePage() {
  const { me } = useAuth();
  if (me === undefined) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">加载中…</div>
    );
  }
  const userId = me?.id ?? null;
  return <IssueWizard key={userId ?? "anon"} userId={userId} />;
}

function IssueWizard({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── V3 草稿持久化:挂载时读一次(emptyDraft 的默认值与各字段初值一致) ─── */
  const [draftBase] = useState<CertificateDraftV1>(
    () => (userId ? loadDraft(userId) : null) ?? emptyDraft(),
  );

  const [step, setStep] = useState<WizardStep>(draftBase.step);

  /* ─── 步骤 1 状态 ─── */
  const [extractResult, setExtractResult] = useState<ExtractHonorResponse | null>(draftBase.extracted);
  /** true 表示用户走「跳过 AI」手动模式,extractResult 保持 null */
  const [manualMode, setManualMode] = useState(false);

  /* ─── 步骤 2 状态:多荣誉表彰记录 + 顶层共享字段 ─── */
  const [records, setRecords] = useState<HonorRecord[]>(draftBase.records);
  const [yearLabel, setYearLabel] = useState(draftBase.yearLabel || defaultYearLabel());
  const [issueDate, setIssueDate] = useState(() => {
    if (draftBase.issueDate) return draftBase.issueDate;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  // 有效期(可空,空 = 永久有效)—— 与年份/日期同在 Step2「共享信息」区编辑
  const [validUntil, setValidUntil] = useState(draftBase.validUntil);

  /* ─── Step 4(录入对象)子步骤索引(records 内 0-based) ─── */
  // 不持久化:进 step 4 时永远从 0 开始;刷新若 step=4 则也从 0 起,用户可以再点 Next 移动
  const [subStepIdx, setSubStepIdx] = useState(0);
  const clampedSubStepIdx = useMemo(
    () => Math.max(0, Math.min(subStepIdx, Math.max(0, records.length - 1))),
    [subStepIdx, records.length],
  );

  /* ─── 草稿 = 各状态的纯派生(防抖落 localStorage;version/updatedAt 沿用底稿) ─── */
  const draft = useMemo<CertificateDraftV1>(
    () => ({ ...draftBase, step, extracted: extractResult, yearLabel, issueDate, validUntil, records }),
    [draftBase, step, extractResult, yearLabel, issueDate, validUntil, records],
  );
  useDebouncedDraft(userId, draft);

  /* ─── 模板列表(共享缓存) ─── */
  const templatesQuery = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });
  const allTemplates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const templateById = useMemo(() => {
    const map = new Map<string, CertificateTemplateDto>();
    allTemplates.forEach((t) => map.set(t.id, t));
    return map;
  }, [allTemplates]);

  /* ─── 当前 step 4(录入对象)焦点 record ─── */
  const currentRecord = records[clampedSubStepIdx] ?? null;
  const currentTemplate = currentRecord?.templateId
    ? templateById.get(currentRecord.templateId)
    : undefined;

  /* ─── 步骤 5(清单 + 发证)状态 ─── */
  const [issuing, setIssuing] = useState(false);
  const [results, setResults] = useState<IssueResult[]>([]);

  /** 总收件人数(全部 record 合并) */
  const totalRecipients = useMemo(
    () => records.reduce((sum, r) => sum + recipientCountOf(r), 0),
    [records],
  );

  /* ─── 校验 ─── */
  const stepReady = useMemo(() => {
    // Step 2:表彰公共信息(年度 / 日期)
    const sharedErr = (() => {
      if (!isValidYearLabel(yearLabel))
        return "表彰年度格式不正确(应为「2024」或「2024-2025」)";
      if (!issueDate) return "请选择表彰日期";
      return null;
    })();

    // Step 3:至少 1 条表彰记录,且每条都选了模板
    const templateErr = (() => {
      if (records.length === 0) return "至少添加 1 条表彰记录";
      for (let i = 0; i < records.length; i++) {
        if (!records[i].templateId)
          return `第 ${i + 1} 条记录:请选择模板`;
      }
      return null;
    })();

    // Step 4:当前焦点 record 的收件人 — 至少 1 个非空即可。
    // (2026-06-01)「所在单位/部门」暂时放开必填,不再拦截留空的行(后端 DTO 同步放开)。
    const recipientsErr = (() => {
      if (!currentRecord) return "没有可填的记录";
      if (currentRecord.honorType === "collective") {
        const named = currentRecord.collectives.filter((c) => c.name.trim());
        if (named.length === 0) return "至少添加 1 个被表彰集体";
      } else {
        const named = currentRecord.persons.filter((p) => p.name.trim());
        if (named.length === 0) return "至少添加 1 位受表彰人员";
      }
      return null;
    })();

    const map: Record<WizardStep, string | null> = {
      1: null,
      2: sharedErr,
      3: templateErr,
      4: recipientsErr,
      5: totalRecipients === 0 ? "没有待发证条目" : null,
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
          const fallback = flattenRecipients(record);
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
        const recipients = flattenRecipients(record);
        const batchTotal = recipients.length;
        for (const rec of recipients) {
          // 统一映射:三处(发证/预览/CSV)共用,确保每个变量都拿到真实值或显式空串
          const variableValues = buildVariableValues({
            recipient: { name: rec.name, dept: rec.dept },
            template,
            yearLabel,
            issueDate,
            validUntil: validUntil || undefined,
          });
          let result: IssueResult;
          try {
            // 1. 先发号建记录(不带 PDF)—— 后端事务分配真实 certNo
            const cert = await certificateIssueApi.issue({
              templateId: template.id,
              recipientUserId: rec.userId,
              recipientName: rec.name,
              recipientEmpNo: rec.empNo || undefined,
              recipientDept: rec.dept || undefined,
              yearLabel,
              batchTotal,
              variableData: JSON.stringify(variableValues),
              issuingOrgName: template.issuingOrgName || undefined,
              honorType: record.honorType,
              issueDate,
              validUntil: validUntil || undefined,
            });
            try {
              // 2. 用真实编号重算变量再渲染(根除占位编号烤进 PDF / 下载图)
              const realValues = { ...variableValues, certNo: cert.certNo };
              const { pdfBlob, thumbnail } =
                await generateCertificateUploadOutputs(designState, realValues);
              // 3. 上传 PDF 到 storage(每个表彰一个文件夹)
              const fileName = `${record.honorName}-${rec.name}${rec.empNo ? "-" + rec.empNo : ""}.pdf`;
              const uploaded = await storageApi.upload(
                pdfBlob,
                {
                  ownerModule: "certificate",
                  folder: `${yearLabel}-${record.honorName}`,
                  visibility: "private",
                },
                fileName,
              );
              // 4. 回填 fileId + 缩略图 + 真号变量快照
              await certificateIssueApi.attachFile(cert.id, {
                pdfFileId: uploaded.id,
                thumbnail,
                variableData: JSON.stringify(realValues),
              });
            } catch (inner) {
              // 渲染/上传/回填失败 → 回滚已发号的空记录,保证「全有或全无」
              try {
                await certificateIssueApi.remove(cert.id);
              } catch {
                /* 回滚失败忽略(记录会成无 PDF 孤儿,可手动删) */
              }
              throw inner;
            }
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
      // 进入「表彰公共信息」前,把 AI 抽取的年度/日期带过去供确认
      if (extractResult?.yearLabel) setYearLabel(extractResult.yearLabel);
      if (extractResult?.issueDate) setIssueDate(extractResult.issueDate);
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      setSubStepIdx(0);
      setStep(4);
      return;
    }
    if (step === 4) {
      if (clampedSubStepIdx < records.length - 1) {
        setSubStepIdx(clampedSubStepIdx + 1);
      } else {
        setStep(5);
      }
      return;
    }
  }

  function goPrev() {
    if (step === 5) {
      setSubStepIdx(Math.max(0, records.length - 1));
      setStep(4);
      return;
    }
    if (step === 4) {
      if (clampedSubStepIdx > 0) {
        setSubStepIdx(clampedSubStepIdx - 1);
      } else {
        setStep(3);
      }
      return;
    }
    if (step === 3) {
      setStep(2);
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
            if (step !== 4) return;
            if (idx <= clampedSubStepIdx) setSubStepIdx(idx);
          }}
        />

        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto p-6">
            {step === 1 && (
              <Step1Upload
                extractResult={extractResult}
                onExtractDone={(r) => setExtractResult(r)}
                onReset={() => setExtractResult(null)}
                onSkipAI={() => commitStep1(null)}
              />
            )}

            {step === 2 && (
              <Step2SharedInfo
                yearLabel={yearLabel}
                onYearLabelChange={setYearLabel}
                issueDate={issueDate}
                onIssueDateChange={setIssueDate}
                validUntil={validUntil}
                onValidUntilChange={setValidUntil}
              />
            )}

            {step === 3 && (
              <Step2HonorRecords
                records={records}
                onRecordsChange={setRecords}
                extracted={extractResult}
              />
            )}

            {step === 4 && currentRecord && (
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

            {step === 5 && (
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

          {/* 底部导航 — 固定在底部(flex-shrink-0),内容区单独滚动,避免人数多时表格压到按钮上 */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-[#E9E9E9] bg-white">
            <div className="text-[11px] text-[#9CA3AF]">
              {step === 1
                ? "选择数据来源开始"
                : step === 2
                  ? "确认表彰公共信息(年度 / 日期 / 有效期)"
                  : step === 3
                    ? `${records.length} 条表彰记录`
                    : step === 4 && currentRecord
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
              {step < 5 && (
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
              {step === 5 && (
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
  /** 集体/个人色块,用于 step 4 的子步骤 */
  typeChip?: "collective" | "individual";
  /** 子步骤可跳的索引(0-based,仅用于 step 4) */
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
    label: "表彰公共信息",
    desc: "年度 / 日期 / 有效期",
    icon: CalendarDaysIcon,
    status: step === 2 ? "active" : step > 2 ? "done" : "pending",
  });
  items.push({
    key: "3",
    badge: "3",
    label: "选证书模板",
    desc: "建立表彰记录,挑模板",
    icon: AwardIcon,
    status: step === 3 ? "active" : step > 3 ? "done" : "pending",
  });

  // Step 4:per-record 子步骤
  if (records.length === 0) {
    items.push({
      key: "4-placeholder",
      badge: "4",
      label: "录入对象",
      desc: "待 Step 3 决定记录",
      icon: UsersIcon,
      status: step === 4 ? "active" : step > 4 ? "done" : "pending",
    });
  } else {
    records.forEach((r, i) => {
      const t = r.templateId
        ? templates.find((tt) => tt.id === r.templateId)
        : undefined;
      const label = r.honorName || t?.name || `第 ${i + 1} 条`;
      const status: StepperStatus =
        step < 4
          ? "pending"
          : step > 4
            ? "done"
            : i < subStepIdx
              ? "done"
              : i === subStepIdx
                ? "active"
                : "pending";
      items.push({
        key: `4-${i}`,
        badge: `4${SUB_LETTERS[i] ?? String(i + 1)}`,
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
    key: "5",
    badge: "5",
    label: "清单 + 发证",
    desc: "最终确认并批量发证",
    icon: ListChecksIcon,
    status: step === 5 ? "active" : "pending",
  });

  return (
    <aside className="bg-white border-r border-[#E9E9E9] p-4 flex flex-col gap-1.5 overflow-auto">
      {items.map((it, i) => {
        const done = it.status === "done";
        const active = it.status === "active";
        const Icon = it.icon;
        const clickable =
          step === 4 && it.jumpIdx !== undefined && it.jumpIdx <= subStepIdx;
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

/* Step 4 三列预览发证已下沉到 components/issue/Step4PreviewIssue.tsx — 容器只透传状态 */
