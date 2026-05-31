import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  UploadIcon,
  FileTextIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateIssueApi,
  type IssueExternalCertificateInput,
} from "@/features/certificate";
import {
  RecipientPicker,
  type RecipientValue,
} from "../components/issue/RecipientPicker";
import { BatchInfoForm } from "../components/issue/BatchInfoForm";
import { isValidYearLabel } from "../lib/certificateNumber";
import { defaultYearLabel } from "../lib/certificateDraft";

const PARTY = "var(--party-primary)";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/**
 * 外部证书上传页 — 用户/部门把别的单位颁发的证书 PDF 录入到本系统,
 * 仍按统一编号规则纳入查询/验证体系。
 *
 * source = 'external';templateId = null;pdfData = 上传的原文件;externalFileData = 同。
 */
export default function CertificateExternalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfData, setPdfData] = useState<string>("");
  const [honorName, setHonorName] = useState("");
  const [honorCode, setHonorCode] = useState("");
  const [recipient, setRecipient] = useState<RecipientValue>({ recipientName: "" });
  const [yearLabel, setYearLabel] = useState(defaultYearLabel());
  const [batchTotal, setBatchTotal] = useState(1);
  const [validUntil, setValidUntil] = useState("");
  const [issuingOrgName, setIssuingOrgName] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (f.size > MAX_PDF_BYTES) {
      toast.error(
        `文件过大(${(f.size / 1024 / 1024).toFixed(1)}MB),最大支持 ${MAX_PDF_BYTES / 1024 / 1024}MB`,
      );
      return;
    }
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("仅支持 PDF 格式");
      return;
    }
    try {
      const url = await fileToDataURL(f);
      setPdfFile(f);
      setPdfData(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "读取失败");
    }
  }

  const errors: string[] = [];
  if (!pdfData) errors.push("请上传 PDF 文件");
  if (!honorName.trim()) errors.push("请填写荣誉名称");
  if (!/^[A-Za-z0-9-]+$/.test(honorCode) || !honorCode) errors.push("请填写荣誉代码(英文/数字)");
  if (!recipient.recipientName.trim()) errors.push("请填写持证人姓名");
  if (!isValidYearLabel(yearLabel)) errors.push("年份段格式不正确");
  if (batchTotal < 1) errors.push("批次总数至少 1");

  const formReady = errors.length === 0;

  const issueMut = useMutation({
    mutationFn: () => {
      const input: IssueExternalCertificateInput = {
        honorName: honorName.trim(),
        honorCode: honorCode.trim().toUpperCase(),
        recipientUserId: recipient.recipientUserId,
        recipientName: recipient.recipientName.trim(),
        recipientEmpNo: recipient.recipientEmpNo?.trim() || undefined,
        recipientDept: recipient.recipientDept?.trim() || undefined,
        recipientIdCard: recipient.recipientIdCard?.trim() || undefined,
        recipientPhone: recipient.recipientPhone?.trim() || undefined,
        yearLabel,
        batchTotal,
        externalFileData: pdfData,
        validUntil: validUntil || undefined,
        issuingOrgName: issuingOrgName.trim() || undefined,
      };
      return certificateIssueApi.issueExternal(input);
    },
    onSuccess: (cert) => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      toast.success(`已录入 ${cert.certNo}`);
      navigate(`/admin/certificates?highlight=${cert.id}`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "录入失败"),
  });

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <header className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <Link
          to="/admin/certificates"
          className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          已发证书
        </Link>
        <div className="w-px h-5 bg-[#E9E9E9]" />
        <UploadIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">外部证书录入</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            把外部单位颁发的证书 PDF 录入本系统,纳入统一查询/验证体系
          </p>
        </div>
        <button
          type="button"
          disabled={!formReady || issueMut.isPending}
          onClick={() => issueMut.mutate()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: PARTY }}
        >
          {issueMut.isPending ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
          录入
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-6 grid grid-cols-1 xl:grid-cols-[1fr_540px] gap-6">
        {/* 表单 */}
        <div className="space-y-6">
          <Section title="① 上传证书 PDF">
            <div
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border-2 border-dashed border-[#E9E9E9] hover:border-[var(--party-primary)] cursor-pointer p-6 text-center"
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {pdfFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileTextIcon className="w-5 h-5 text-[var(--party-primary)]" />
                  <span className="font-medium">{pdfFile.name}</span>
                  <span className="text-[10px] text-[#9CA3AF]">
                    {(pdfFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ) : (
                <>
                  <UploadIcon className="w-7 h-7 mx-auto text-[#9CA3AF] mb-2" />
                  <p className="text-sm text-[#1A1A1A] font-medium">点击或拖拽 PDF 到这里</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-1">仅接受 .pdf,最大 10MB</p>
                </>
              )}
            </div>
          </Section>

          <Section title="② 荣誉信息">
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput
                label="荣誉名称 *"
                value={honorName}
                onChange={setHonorName}
                placeholder="如:行业先进个人"
              />
              <LabeledInput
                label="荣誉代码 * (英文/数字)"
                value={honorCode}
                onChange={(v) => setHonorCode(v.toUpperCase().slice(0, 32))}
                placeholder="如 HYXJ"
                mono
              />
              <LabeledInput
                label="颁发机构(可选)"
                value={issuingOrgName}
                onChange={setIssuingOrgName}
                placeholder="如:省人社厅"
              />
            </div>
          </Section>

          <Section title="③ 持证人">
            <RecipientPicker value={recipient} onChange={setRecipient} />
          </Section>

          <Section title="④ 批次信息">
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

        {/* 预览 */}
        <aside className="xl:sticky xl:top-0 self-start">
          <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
            <div className="text-xs font-semibold text-[#6B7280] mb-3 uppercase tracking-wide">
              PDF 预览
            </div>
            {pdfData ? (
              <iframe
                src={pdfData}
                title="external pdf preview"
                className="w-full"
                style={{ height: 540, border: "1px solid #E9E9E9" }}
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-xs text-[#9CA3AF] border border-dashed border-[#E9E9E9] rounded">
                上传后这里预览
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-[#E9E9E9] p-4">
      <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">{title}</h3>
      {children}
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-[#6B7280] mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none ${
          mono ? "font-mono uppercase tracking-wider" : ""
        }`}
      />
    </label>
  );
}
