import { useRef, useState } from "react";
import { toast } from "sonner";
import { Building2Icon, DownloadIcon, UploadIcon, Users2Icon, InfoIcon } from "lucide-react";
import { downloadBlob } from "@/shared/lib/download";
import { importApi, type ImportResult } from "../api";

function errMsg(e: unknown): string {
  const resp = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return resp || (e as Error)?.message || "未知错误";
}

interface CardProps {
  icon: React.ElementType;
  title: string;
  desc: string;
  steps: string[];
  templateName: string;
  onTemplate: () => Promise<Blob>;
  onImport: (file: File) => Promise<ImportResult>;
}

function ImportCard({ icon: Icon, title, desc, steps, templateName, onTemplate, onImport }: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function download() {
    try {
      downloadBlob(await onTemplate(), templateName);
    } catch (e) {
      toast.error(`模板下载失败:${errMsg(e)}`);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重选同一文件
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await onImport(file);
      setResult(res);
      if (res.errors.length === 0) toast.success(`导入完成:新增 ${res.created}、跳过 ${res.skipped}`);
      else toast.warning(`导入完成但有 ${res.errors.length} 行出错,见下方明细`);
    } catch (e) {
      toast.error(`导入失败:${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#E9E9E9] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-[var(--party-primary)]" />
        <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
      </div>
      <p className="mb-3 text-sm text-[#6B7280]">{desc}</p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-xs text-[#6B7280]">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E9E9E9] px-3 py-2 text-sm text-[#374151] transition-colors hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
        >
          <DownloadIcon className="h-4 w-4" /> 下载模板
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          <UploadIcon className="h-4 w-4" /> {busy ? "导入中…" : "上传并导入"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {result && (
        <div className="mt-4 rounded-lg bg-[#FAFAFA] p-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>共 <b>{result.total}</b> 行</span>
            <span className="text-green-600">新增 <b>{result.created}</b></span>
            <span className="text-[#9CA3AF]">跳过(已存在)<b>{result.skipped}</b></span>
            <span className={result.errors.length ? "text-red-600" : "text-[#9CA3AF]"}>
              出错 <b>{result.errors.length}</b>
            </span>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 max-h-48 overflow-auto rounded border border-[#EEE] bg-white">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#F5F5F5] text-[#6B7280]">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">行号</th>
                    <th className="px-2 py-1 text-left font-medium">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((err, i) => (
                    <tr key={i} className="border-t border-[#F0F0F0]">
                      <td className="whitespace-nowrap px-2 py-1 text-[#9CA3AF]">第 {err.row} 行</td>
                      <td className="px-2 py-1 text-red-600">{err.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataImportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[#1A1A1A]">数据导入</h1>
        <p className="mt-1 text-sm text-[#6B7280]">用 Excel 批量导入组织机构和员工。建议先导「组织机构」,再导「用户」(用户要按组织编码归属)。</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ImportCard
          icon={Building2Icon}
          title="导入组织机构"
          desc="按「上级编码」建党组织 / 行政机构树。已存在的编码自动跳过,可反复导只新增。"
          steps={[
            "下载模板,按示例填写(编码全局唯一,上级编码指向父组织)",
            "同一张表里父可在子上面或下面,系统自动按上级编码建树",
            "上传导入,结果与出错行会即时显示",
          ]}
          templateName="组织机构导入模板.xlsx"
          onTemplate={importApi.orgTemplate}
          onImport={importApi.importOrganizations}
        />
        <ImportCard
          icon={Users2Icon}
          title="导入用户"
          desc="按工号建员工,归入行政机构 / 党组织,并自动赋「普通用户」默认角色。"
          steps={[
            "先确保组织已导入(用户按组织编码归属)",
            "下载模板填写:工号、姓名、所属组织编码等",
            "上传导入。工号已存在的只补归属,不重复建号",
          ]}
          templateName="用户导入模板.xlsx"
          onTemplate={importApi.userTemplate}
          onImport={importApi.importUsers}
        />
      </div>

      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <b>导入用户后</b>:员工还需要一个统一登录(Casdoor)账号才能登录。用户名册以此处为准,
          再运行「同步到 Casdoor」即可为新员工创建登录账号(登录名=工号)。角色/权限在「用户管理」里可再单独调整。
        </div>
      </div>
    </div>
  );
}
