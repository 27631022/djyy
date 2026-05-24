import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  SendIcon,
  AwardIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateIssueApi,
  certificateTemplateApi,
  type CertificateTemplateDto,
  type IssueCertificateInput,
  type ExtractHonorResponse,
} from "@/features/certificate";
import { TemplatePicker } from "../components/issue/TemplatePicker";
import {
  RecipientPicker,
  type RecipientValue,
} from "../components/issue/RecipientPicker";
import { BatchInfoForm } from "../components/issue/BatchInfoForm";
import { VariableForm } from "../components/issue/VariableForm";
import { PreviewCanvas } from "../components/issue/PreviewCanvas";
import { AIExtractDropzone } from "../components/issue/AIExtractDropzone";
import type { DesignerState } from "../lib/designerTypes";
import {
  buildCertNo,
  isValidYearLabel,
} from "../lib/certificateNumber";
import { generateCertificatePdfDataUrl } from "../lib/certificatePdf";

const PARTY = "var(--party-primary)";
const AUTO_KEYS = new Set(["name", "certNo", "issueDate"]);

function todayChinese(): string {
  const d = new Date();
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(
    d.getDate(),
  ).padStart(2, "0")}日`;
}

export default function CertificateIssuePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── 模板 ─── */
  const [template, setTemplate] = useState<CertificateTemplateDto | null>(null);
  const designState: DesignerState | null = useMemo(() => {
    if (!template) return null;
    try {
      return JSON.parse(template.designJson) as DesignerState;
    } catch {
      return null;
    }
  }, [template]);

  /* ─── 持证人 ─── */
  const [recipient, setRecipient] = useState<RecipientValue>({
    recipientName: "",
  });

  /* ─── AI 提取的额外收件人(用户应用后,首位塞进 recipient,其余排队提示用户后续处理) ─── */
  const [pendingRecipients, setPendingRecipients] = useState<
    Array<{ name: string; empNo?: string; dept?: string }>
  >([]);

  // 拉所有模板,用于 AI 提取后按 honorName 自动匹配 honorCode
  const templatesQuery = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });

  /* ─── 批次信息 ─── */
  const [yearLabel, setYearLabel] = useState<string>(
    String(new Date().getFullYear()),
  );
  const [batchTotal, setBatchTotal] = useState<number>(1);
  const [validUntil, setValidUntil] = useState<string>("");

  /* ─── 变量值(用户填) ─── */
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // 持证人/批次变化时自动同步几个固定 key 的值(name/issueDate/certNo)
  useEffect(() => {
    setVariableValues((prev) => {
      const next = { ...prev };
      // name 跟随持证人
      if (recipient.recipientName) next.name = recipient.recipientName;
      // issueDate 默认今天(中文)
      if (!next.issueDate) next.issueDate = todayChinese();
      // certNo 预览用占位 — 发证后会被服务端覆盖
      if (template?.honorCode && isValidYearLabel(yearLabel)) {
        // 预览阶段:用 batchSeq=1 作示意,实际由服务端给
        next.certNo = buildCertNo(yearLabel, template.honorCode, batchTotal, 1);
      } else if (!next.certNo) {
        next.certNo = "待生成";
      }
      return next;
    });
  }, [recipient.recipientName, template?.honorCode, yearLabel, batchTotal]);

  function setVar(key: string, value: string) {
    setVariableValues((prev) => ({ ...prev, [key]: value }));
  }

  /** AI 提取结果应用到表单:挑模板 + 填年份 + 填 batchTotal + 首位收件人 + 其余排队 */
  function applyExtracted(r: ExtractHonorResponse) {
    // 1. 模板匹配:honorName 包含 template.name 或 honorCode 命中
    const templates = templatesQuery.data ?? [];
    const matched = templates.find((t) => {
      if (!t.honorCode) return false;
      const hn = r.honorName.toLowerCase();
      return (
        hn.includes(t.name.toLowerCase()) ||
        hn.includes(t.honorCode.toLowerCase()) ||
        t.name.toLowerCase().includes(hn)
      );
    });
    if (matched) setTemplate(matched);

    // 2. 年份
    if (r.yearLabel) setYearLabel(r.yearLabel);

    // 3. 收件人:首位塞进 recipient,其余 push 到 pending
    if (r.recipients.length > 0) {
      const first = r.recipients[0];
      setRecipient({
        recipientName: first.name,
        recipientEmpNo: first.empNo,
        recipientDept: first.dept,
      });
      setPendingRecipients(r.recipients.slice(1));
    }

    // 4. batchTotal
    setBatchTotal(Math.max(1, r.recipients.length));
  }

  /** 切到 pending 队列的下一位 */
  function nextPending() {
    if (pendingRecipients.length === 0) return;
    const [next, ...rest] = pendingRecipients;
    setRecipient({
      recipientName: next.name,
      recipientEmpNo: next.empNo,
      recipientDept: next.dept,
    });
    setPendingRecipients(rest);
  }

  /* ─── 校验 ─── */
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!template) e.push("请选择模板");
    if (template && !template.honorCode) e.push("模板未设置荣誉首字母代码");
    if (!recipient.recipientName.trim()) e.push("请填写持证人姓名");
    if (!isValidYearLabel(yearLabel)) e.push("年份段格式不正确");
    if (batchTotal < 1) e.push("批次总数至少为 1");
    return e;
  }, [template, recipient, yearLabel, batchTotal]);

  /* ─── 发证 ─── */
  const issueMut = useMutation({
    mutationFn: async () => {
      if (!template || !designState) throw new Error("模板未就绪");
      // 用最终的 variableValues 渲染 PDF
      const pdfData = await generateCertificatePdfDataUrl(
        designState,
        variableValues,
      );
      const input: IssueCertificateInput = {
        templateId: template.id,
        recipientUserId: recipient.recipientUserId,
        recipientName: recipient.recipientName.trim(),
        recipientEmpNo: recipient.recipientEmpNo?.trim() || undefined,
        recipientDept: recipient.recipientDept?.trim() || undefined,
        recipientIdCard: recipient.recipientIdCard?.trim() || undefined,
        recipientPhone: recipient.recipientPhone?.trim() || undefined,
        yearLabel,
        batchTotal,
        variableData: JSON.stringify(variableValues),
        pdfData,
        validUntil: validUntil || undefined,
      };
      return certificateIssueApi.issue(input);
    },
    onSuccess: (cert) => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      toast.success(`已发证 ${cert.certNo}`);
      // 还有 pending 收件人时 → 留在本页,切到下一位继续发
      if (pendingRecipients.length > 0) {
        nextPending();
      } else {
        navigate(`/admin/certificates?highlight=${cert.id}`);
      }
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "发证失败"),
  });

  const formReady = errors.length === 0;
  const submitting = issueMut.isPending;

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
          <h1 className="text-lg font-bold text-[#1A1A1A]">发证</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            选模板 → 选持证人 → 填变量 → 预览 → 发证
          </p>
        </div>
        <button
          type="button"
          disabled={!formReady || submitting}
          onClick={() => issueMut.mutate()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ backgroundColor: PARTY }}
        >
          {submitting ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" />
              发证中…
            </>
          ) : (
            <>
              <SendIcon className="w-4 h-4" />
              发证
            </>
          )}
        </button>
      </header>

      {/* 内容区:左侧表单 + 右侧预览 */}
      <div className="flex-1 min-h-0 overflow-auto p-6 grid grid-cols-1 xl:grid-cols-[1fr_580px] gap-6">
        {/* ── 左:表单 ── */}
        <div className="space-y-6">
          {/* AI 提取(Phase D)— 可选,加快批量发证场景 */}
          <AIExtractDropzone onExtracted={applyExtracted} />

          {/* 待发收件人队列(AI 提取多人时出现) */}
          {pendingRecipients.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <SparklesIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div className="flex-1 text-xs text-amber-900">
                AI 提取了多位收件人。本次先发当前 1 位,队列里还有{" "}
                <span className="font-bold">{pendingRecipients.length}</span> 位待发:
                <span className="ml-1 font-mono">
                  {pendingRecipients
                    .slice(0, 5)
                    .map((r) => r.name)
                    .join("、")}
                  {pendingRecipients.length > 5 ? ` 等` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={nextPending}
                className="text-[11px] px-2 py-1 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-medium"
              >
                切换下一位 →
              </button>
            </div>
          )}

          <Section title="① 选择模板" icon={<AwardIcon className="w-4 h-4" />}>
            <TemplatePicker selectedId={template?.id ?? null} onChange={setTemplate} />
          </Section>

          {template && (
            <>
              <Section title="② 持证人">
                <RecipientPicker value={recipient} onChange={setRecipient} />
              </Section>

              <Section title="③ 批次信息">
                <BatchInfoForm
                  yearLabel={yearLabel}
                  batchTotal={batchTotal}
                  validUntil={validUntil}
                  onChange={(p) => {
                    if (p.yearLabel !== undefined) setYearLabel(p.yearLabel);
                    if (p.batchTotal !== undefined) setBatchTotal(p.batchTotal);
                    if (p.validUntil !== undefined) setValidUntil(p.validUntil);
                  }}
                />
              </Section>

              <Section title="④ 变量字段">
                <VariableForm
                  variables={designState?.variables ?? []}
                  values={variableValues}
                  onChange={setVar}
                  autoFilledKeys={AUTO_KEYS}
                />
              </Section>
            </>
          )}

          {errors.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
              <div className="font-medium mb-1">还差一些信息:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── 右:实时预览 ── */}
        <aside className="xl:sticky xl:top-0 self-start">
          <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
            <div className="text-xs font-semibold text-[#6B7280] mb-3 uppercase tracking-wide">
              实时预览
            </div>
            {designState ? (
              <PreviewCanvas
                state={designState}
                variableValues={variableValues}
                maxWidth={540}
                maxHeight={420}
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-xs text-[#9CA3AF] border border-dashed border-[#E9E9E9] rounded">
                选模板后这里出现预览
              </div>
            )}
            {template && (
              <div className="mt-3 text-[11px] text-[#9CA3AF] space-y-0.5">
                <div>
                  模板:<span className="text-[#1A1A1A]">{template.name}</span>
                </div>
                <div>
                  荣誉代码:
                  <span className="font-mono text-[var(--party-primary)]">
                    {template.honorCode || "—"}
                  </span>
                </div>
                <div>
                  预编号:
                  <span className="font-mono text-[#6B7280]">
                    {variableValues.certNo || "—"}
                  </span>
                  <span className="ml-1 text-[10px]">(发证后服务端最终生成)</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg border border-[#E9E9E9] p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-[var(--party-primary)]">{icon}</span>}
        <h3 className="text-sm font-semibold text-[#1A1A1A]">{title}</h3>
      </div>
      {children}
    </section>
  );
}
