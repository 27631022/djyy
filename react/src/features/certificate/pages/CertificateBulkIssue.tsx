import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  UploadIcon,
  FileTextIcon,
  SendIcon,
  Loader2Icon,
  CheckCircle2Icon,
  XCircleIcon,
  RotateCcwIcon,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  certificateIssueApi,
  certificateTemplateApi,
  type CertificateTemplateDto,
  type IssueCertificateInput,
} from "@/features/certificate";
import { TemplatePicker } from "../components/issue/TemplatePicker";
import { BatchInfoForm } from "../components/issue/BatchInfoForm";
import { generateCertificatePdfDataUrl } from "../lib/certificatePdf";
import { isValidYearLabel } from "../lib/certificateNumber";
import type { DesignerState, VariableField } from "../lib/designerTypes";

const PARTY = "var(--party-primary)";

/** 把列名/变量 label 规则化(去空格,转小写),以便模糊比对 */
function normalize(s: string): string {
  return s.replace(/[\s\-_]/g, "").toLowerCase();
}

/** CSV 列 → 模板变量 key 自动匹配 */
function autoMap(
  csvColumns: string[],
  variables: VariableField[],
): Record<string, string> {
  // key = variable.key, value = csvColumnName 或 ""(未映射)
  const map: Record<string, string> = {};
  for (const v of variables) {
    const target = normalize(v.label);
    const altKey = normalize(v.key);
    const hit = csvColumns.find((c) => {
      const n = normalize(c);
      return n === target || n === altKey || n.includes(target) || target.includes(n);
    });
    map[v.key] = hit ?? "";
  }
  return map;
}

/** 收件人字段映射(姓名/员工号/部门) */
interface RecipientMapping {
  name: string;
  empNo: string;
  dept: string;
}
function autoMapRecipient(csvColumns: string[]): RecipientMapping {
  function find(...candidates: string[]): string {
    for (const cand of candidates) {
      const n = normalize(cand);
      const hit = csvColumns.find((c) => normalize(c) === n || normalize(c).includes(n));
      if (hit) return hit;
    }
    return "";
  }
  return {
    name: find("姓名", "名字", "name", "recipient"),
    empNo: find("员工编号", "员工号", "工号", "empno", "username"),
    dept: find("部门", "dept", "department"),
  };
}

interface ParsedCSV {
  columns: string[];
  rows: Record<string, string>[];
}

export default function CertificateBulkIssuePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [template, setTemplate] = useState<CertificateTemplateDto | null>(null);
  const designState: DesignerState | null = useMemo(() => {
    if (!template) return null;
    try {
      return JSON.parse(template.designJson) as DesignerState;
    } catch {
      return null;
    }
  }, [template]);
  const variables = designState?.variables ?? [];

  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [varMap, setVarMap] = useState<Record<string, string>>({});
  const [recMap, setRecMap] = useState<RecipientMapping>({
    name: "",
    empNo: "",
    dept: "",
  });

  const [yearLabel, setYearLabel] = useState(String(new Date().getFullYear()));
  const [validUntil, setValidUntil] = useState("");

  // 进度追踪
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    failures: Array<{ row: number; reason: string }>;
  } | null>(null);

  // 我们要在模板拉好后帮用户匹配 — 用一个 query 触发 once
  useQuery({
    queryKey: ["certificate-templates", "bulk-list"],
    queryFn: () => certificateTemplateApi.list(true),
    staleTime: 5 * 60 * 1000,
  });

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const rows = (res.data as Record<string, string>[]).filter((r) =>
          Object.values(r).some((v) => v && v.trim()),
        );
        const columns = (res.meta?.fields ?? []) as string[];
        if (columns.length === 0 || rows.length === 0) {
          toast.error("CSV 解析为空,请检查格式(需带表头行)");
          return;
        }
        setCsv({ columns, rows });
        // 自动映射
        if (variables.length > 0) setVarMap(autoMap(columns, variables));
        setRecMap(autoMapRecipient(columns));
        toast.success(`解析 ${rows.length} 行,${columns.length} 列`);
      },
      error: (err) => toast.error(err.message),
    });
  }

  /** 当用户先上传 CSV 再选模板,或反过来时,确保 varMap 同步 */
  function changeTemplate(t: CertificateTemplateDto | null) {
    setTemplate(t);
    if (!csv || !t) return;
    try {
      const ds = JSON.parse(t.designJson) as DesignerState;
      setVarMap(autoMap(csv.columns, ds.variables ?? []));
    } catch {
      // ignore
    }
  }

  const batchTotal = csv?.rows.length ?? 0;
  const errors: string[] = [];
  if (!template) errors.push("请选择模板");
  if (template && !template.honorCode) errors.push("模板未设置荣誉首字母代码");
  if (!csv) errors.push("请上传 CSV 文件");
  if (csv && !recMap.name) errors.push("请映射「姓名」列");
  if (!isValidYearLabel(yearLabel)) errors.push("年份段格式不正确");

  const bulkMut = useMutation({
    mutationFn: async () => {
      if (!template || !designState || !csv) throw new Error("数据未就绪");
      const failures: Array<{ row: number; reason: string }> = [];
      setProgress({ done: 0, total: csv.rows.length, failures: [] });

      for (let i = 0; i < csv.rows.length; i++) {
        const row = csv.rows[i];
        const name = (row[recMap.name] ?? "").trim();
        if (!name) {
          failures.push({ row: i + 1, reason: "姓名为空" });
          setProgress((p) =>
            p ? { ...p, done: p.done + 1, failures: [...failures] } : p,
          );
          continue;
        }
        const variableValues: Record<string, string> = {};
        for (const v of variables) {
          const csvCol = varMap[v.key];
          if (csvCol && row[csvCol] !== undefined) variableValues[v.key] = row[csvCol];
        }
        // 自动同步 name
        if (!variableValues.name) variableValues.name = name;

        try {
          const pdfData = await generateCertificatePdfDataUrl(designState, variableValues);
          const input: IssueCertificateInput = {
            templateId: template.id,
            recipientName: name,
            recipientEmpNo: (row[recMap.empNo] ?? "").trim() || undefined,
            recipientDept: (row[recMap.dept] ?? "").trim() || undefined,
            yearLabel,
            batchTotal: csv.rows.length,
            variableData: JSON.stringify(variableValues),
            pdfData,
            validUntil: validUntil || undefined,
          };
          await certificateIssueApi.issue(input);
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          failures.push({ row: i + 1, reason });
        }
        setProgress((p) =>
          p ? { ...p, done: p.done + 1, failures: [...failures] } : p,
        );
      }

      return failures;
    },
    onSuccess: (failures) => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      const ok = (csv?.rows.length ?? 0) - failures.length;
      if (failures.length === 0) {
        toast.success(`已全部发证 ${ok} 张`);
        navigate("/admin/certificates");
      } else {
        toast.warning(`完成:${ok} 成功 / ${failures.length} 失败`);
      }
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "批量发证失败"),
  });

  const submitting = bulkMut.isPending;
  const formReady = errors.length === 0;

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
        <FileTextIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">CSV 批量发证</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            上传 CSV → 自动匹配字段 → 逐条发证(同一批次,seq 自动递增)
          </p>
        </div>
        <button
          type="button"
          disabled={!formReady || submitting}
          onClick={() => bulkMut.mutate()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: PARTY }}
        >
          {submitting ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
          全部发证 ({batchTotal})
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Section title="① 选择模板">
          <TemplatePicker selectedId={template?.id ?? null} onChange={changeTemplate} />
        </Section>

        <Section title="② 上传 CSV">
          <CSVUpload csv={csv} onFile={handleFile} onClear={() => setCsv(null)} />
        </Section>

        {csv && template && (
          <>
            <Section title="③ 字段映射(自动匹配,可调整)">
              <MappingPanel
                csvColumns={csv.columns}
                variables={variables}
                varMap={varMap}
                onVarChange={(k, v) => setVarMap((p) => ({ ...p, [k]: v }))}
                recMap={recMap}
                onRecChange={(p) => setRecMap((cur) => ({ ...cur, ...p }))}
              />
            </Section>

            <Section title="④ 批次信息">
              <BatchInfoForm
                yearLabel={yearLabel}
                batchTotal={batchTotal}
                validUntil={validUntil}
                onChange={(p) => {
                  if (p.yearLabel !== undefined) setYearLabel(p.yearLabel);
                  if (p.validUntil !== undefined) setValidUntil(p.validUntil);
                  // batchTotal 由 CSV 行数决定,不可手改
                }}
              />
              <p className="mt-2 text-[11px] text-[#9CA3AF]">
                * 批次总数 = CSV 行数 ({batchTotal}),不可手动修改
              </p>
            </Section>

            <Section title="⑤ 数据预览(前 5 行)">
              <PreviewTable csv={csv} maxRows={5} />
            </Section>
          </>
        )}

        {progress && <ProgressPanel progress={progress} />}

        {errors.length > 0 && !submitting && (
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

function CSVUpload({
  csv,
  onFile,
  onClear,
}: {
  csv: ParsedCSV | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  return csv ? (
    <div className="flex items-center gap-3">
      <FileTextIcon className="w-5 h-5 text-[var(--party-primary)]" />
      <span className="text-sm font-medium">
        已解析:{csv.rows.length} 行 × {csv.columns.length} 列
      </span>
      <span className="text-[11px] text-[#9CA3AF]">
        列名:{csv.columns.join(" / ")}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto flex items-center gap-1 text-xs text-[#9CA3AF] hover:text-red-600"
      >
        <RotateCcwIcon className="w-3.5 h-3.5" />
        重新上传
      </button>
    </div>
  ) : (
    <label className="cursor-pointer block rounded-lg border-2 border-dashed border-[#E9E9E9] hover:border-[var(--party-primary)] p-6 text-center">
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <UploadIcon className="w-7 h-7 mx-auto text-[#9CA3AF] mb-2" />
      <p className="text-sm text-[#1A1A1A] font-medium">点击上传 CSV 文件</p>
      <p className="text-[11px] text-[#9CA3AF] mt-1">
        第一行作为列头,如 姓名,员工编号,部门,职务,...
      </p>
    </label>
  );
}

function MappingPanel({
  csvColumns,
  variables,
  varMap,
  onVarChange,
  recMap,
  onRecChange,
}: {
  csvColumns: string[];
  variables: VariableField[];
  varMap: Record<string, string>;
  onVarChange: (k: string, v: string) => void;
  recMap: RecipientMapping;
  onRecChange: (p: Partial<RecipientMapping>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-medium text-[#6B7280] mb-2">收件人字段</div>
        <div className="grid grid-cols-3 gap-2">
          <ColumnSelect
            label="姓名 *"
            value={recMap.name}
            onChange={(v) => onRecChange({ name: v })}
            options={csvColumns}
          />
          <ColumnSelect
            label="员工编号"
            value={recMap.empNo}
            onChange={(v) => onRecChange({ empNo: v })}
            options={csvColumns}
          />
          <ColumnSelect
            label="部门"
            value={recMap.dept}
            onChange={(v) => onRecChange({ dept: v })}
            options={csvColumns}
          />
        </div>
      </div>

      {variables.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-[#6B7280] mb-2">模板变量字段</div>
          <div className="grid grid-cols-3 gap-2">
            {variables.map((v) => (
              <ColumnSelect
                key={v.key}
                label={v.label}
                value={varMap[v.key] ?? ""}
                onChange={(c) => onVarChange(v.key, c)}
                options={csvColumns}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-[#6B7280] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
      >
        <option value="">— 不映射 —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function PreviewTable({ csv, maxRows }: { csv: ParsedCSV; maxRows: number }) {
  const rows = csv.rows.slice(0, maxRows);
  return (
    <div className="overflow-auto rounded border border-[#E9E9E9]">
      <table className="w-full text-xs">
        <thead className="bg-[#F7F8FA]">
          <tr className="text-[10px] text-[#6B7280]">
            <th className="px-2 py-1 text-left w-10">#</th>
            {csv.columns.map((c) => (
              <th key={c} className="px-2 py-1 text-left">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F0F0F0]">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-2 py-1 text-[#9CA3AF] font-mono">{i + 1}</td>
              {csv.columns.map((c) => (
                <td key={c} className="px-2 py-1 truncate max-w-[120px]" title={r[c]}>
                  {r[c] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {csv.rows.length > maxRows && (
        <div className="px-2 py-1 text-[10px] text-[#9CA3AF] bg-[#F7F8FA] text-center">
          仅显示前 {maxRows} 行,共 {csv.rows.length} 行
        </div>
      )}
    </div>
  );
}

function ProgressPanel({
  progress,
}: {
  progress: {
    done: number;
    total: number;
    failures: Array<{ row: number; reason: string }>;
  };
}) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const ok = progress.done - progress.failures.length;
  return (
    <section className="bg-white rounded-lg border border-[#E9E9E9] p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">发证进度</h3>
        <span className="text-xs text-[#6B7280] font-mono">
          {progress.done} / {progress.total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#F0F0F0] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--party-primary)] to-[var(--party-accent)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1 text-green-700">
          <CheckCircle2Icon className="w-3.5 h-3.5" />
          成功 {ok}
        </div>
        <div className="flex items-center gap-1 text-red-700">
          <XCircleIcon className="w-3.5 h-3.5" />
          失败 {progress.failures.length}
        </div>
      </div>
      {progress.failures.length > 0 && (
        <div className="mt-3 max-h-32 overflow-auto rounded bg-red-50 border border-red-200 p-2">
          <div className="text-[11px] font-medium text-red-700 mb-1">失败行:</div>
          <ul className="text-[11px] text-red-700 space-y-0.5">
            {progress.failures.map((f) => (
              <li key={f.row}>
                第 {f.row} 行:{f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
