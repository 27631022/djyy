import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  CheckCircle2Icon,
  ClockIcon,
  PackageIcon,
  Loader2Icon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import {
  taskApi,
  groupTaskFields,
  taskStatusChip,
  TASK_TARGET_STATUS_LABEL,
  type TaskField,
  type TaskSummary,
  type TaskSummaryRow,
} from "../api";

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

function fmtNum(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : String(n);
}

/** 填报值 file/image:{id,name}[] */
interface FilledFile {
  id: string;
  name: string;
}
function asFiles(v: unknown): FilledFile[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) =>
      it && typeof it === "object" && typeof (it as FilledFile).id === "string"
        ? { id: (it as FilledFile).id, name: (it as FilledFile).name ?? "文件" }
        : null,
    )
    .filter((x): x is FilledFile => !!x);
}

async function downloadFile(file: FilledFile) {
  try {
    const blob = await storageApi.fetchBlob(file.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("下载失败");
  }
}

/** 把单个填报值转成纯文本(CSV 导出 + 无附件时单元格用) */
function valueToText(field: TaskField, value: unknown): string {
  if (field.type === "file" || field.type === "image") {
    return asFiles(value)
      .map((f) => f.name)
      .join("; ");
  }
  if (field.type === "doclink") return value === true ? "已完成" : "未完成";
  if (value === null || value === undefined || value === "") return "";
  let t = String(value);
  if (field.type === "number" && field.unit) t = `${t}${field.unit}`;
  return t;
}

/** 单元格渲染(file/image 出下载按钮,其它纯文本) */
function SummaryCell({ field, value }: { field: TaskField; value: unknown }) {
  if (field.type === "file" || field.type === "image") {
    const files = asFiles(value);
    if (files.length === 0) return <span className="text-[#D1D5DB]">—</span>;
    return (
      <div className="flex flex-col gap-1 items-start">
        {files.map((f, i) => (
          <button
            key={f.id + i}
            type="button"
            onClick={() => downloadFile(f)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#dce4ef] bg-white text-[11px] hover:border-[var(--party-primary)] max-w-[180px]"
            title={`下载 ${f.name}`}
          >
            {field.type === "image" ? (
              <ImageIcon className="w-3 h-3 text-[#1A6BC8] flex-shrink-0" />
            ) : (
              <FileTextIcon className="w-3 h-3 text-[#1A6BC8] flex-shrink-0" />
            )}
            <span className="truncate text-[#172033]">{f.name}</span>
            <DownloadIcon className="w-2.5 h-2.5 text-[#9CA3AF] flex-shrink-0" />
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "doclink") {
    const done = value === true;
    return done ? (
      <span className="inline-flex items-center gap-0.5 text-[#047857]">
        <CheckCircle2Icon className="w-3 h-3" />完成
      </span>
    ) : (
      <span className="text-[#B45309]">未完成</span>
    );
  }
  const text = valueToText(field, value);
  if (!text) return <span className="text-[#D1D5DB]">—</span>;
  const align = field.type === "number" ? "text-right tabular-nums" : "";
  return <span className={`whitespace-pre-wrap break-words ${align}`}>{text}</span>;
}

/** 纯文本表 → CSV(带 UTF-8 BOM,Excel 中文不乱码) */
function toCsv(matrix: string[][]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "﻿" + matrix.map((row) => row.map(esc).join(",")).join("\r\n");
}

/** 从 axios blob 错误响应里取后端 message(blob 下载失败时错误体也是 Blob) */
async function blobErrorMessage(e: unknown, fallback: string): Promise<string> {
  const resp = (e as { response?: { data?: unknown } }).response;
  if (resp?.data instanceof Blob) {
    try {
      const j = JSON.parse(await resp.data.text()) as { message?: string | string[] };
      if (Array.isArray(j.message)) return j.message.join("; ");
      if (typeof j.message === "string") return j.message;
    } catch {
      /* 非 JSON 错误体,忽略 */
    }
  }
  return (e as { message?: string }).message ?? fallback;
}

export default function TaskSummaryPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["task-summary", id],
    queryFn: () => taskApi.summary(id),
    enabled: !!id,
  });
  const data = q.data;
  const hasFileFields =
    !!data && data.fields.some((f) => f.type === "file" || f.type === "image");

  const zipMut = useMutation({
    mutationFn: () => taskApi.attachmentsZip(id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data?.title ?? "任务"}-附件.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("附件已按单位打包下载");
    },
    onError: async (e) => toast.error(await blobErrorMessage(e, "附件打包失败")),
  });

  function exportCsv(s: TaskSummary) {
    const flat = groupTaskFields(s.fields).flatMap((g) => g.fields);
    const header = ["单位 / 对象", "责任人", "状态", ...flat.map((f) => f.label)];
    const body = s.rows.map((r) => [
      r.targetName,
      r.ownerName ?? "",
      TASK_TARGET_STATUS_LABEL[r.status] ?? r.status,
      ...flat.map((f) => valueToText(f, r.values[f.code])),
    ]);
    const totalRow = [
      "合计",
      "",
      `${s.counts.filled}/${s.counts.total} 已填报`,
      ...flat.map((f) => {
        const t = s.numberTotals[f.code];
        return t ? `${fmtNum(t.sum, t.decimals)}${t.unit ?? ""}` : "";
      }),
    ];
    const csv = toCsv([header, ...body, totalRow]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.title}-汇总.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("已导出 CSV");
  }

  const groups = data ? groupTaskFields(data.fields) : [];
  const flatFields = groups.flatMap((g) => g.fields);

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <button
          onClick={() => navigate(`/admin/tasks/${id}`)}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-[#1A1A1A] truncate flex items-center gap-2">
            <span className="truncate">{data?.title ?? "任务汇总"}</span>
            {data?.periodLabel && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#FFF7ED] text-[#C2410C] font-normal flex-shrink-0">
                {data.periodLabel}
              </span>
            )}
            <span className="text-[13px] font-normal text-[#9CA3AF] flex-shrink-0">填报汇总</span>
          </h1>
        </div>
        {data && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasFileFields && (
              <button
                onClick={() => zipMut.mutate()}
                disabled={zipMut.isPending}
                title="把各单位提交的附件按「单位/字段-文件名」打包成 ZIP 下载"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
              >
                {zipMut.isPending ? (
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                ) : (
                  <PackageIcon className="w-4 h-4" />
                )}
                {zipMut.isPending ? "打包中…" : "导出附件"}
              </button>
            )}
            <button
              onClick={() => exportCsv(data)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              <DownloadIcon className="w-4 h-4" />
              导出 CSV
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {q.isLoading ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
        ) : !data ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">任务不存在或无权限</div>
        ) : (
          <div className="max-w-full space-y-3">
            {/* 概况 */}
            <div className="flex items-center gap-4 flex-wrap text-[13px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[#6B7280]">已填报</span>
                <b className="text-[#047857] text-[18px]">{data.counts.filled}</b>
                <span className="text-[#9CA3AF]">/ {data.counts.total}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[#6B7280]">
                <ClockIcon className="w-3.5 h-3.5" /> 截止 {fmtDate(data.dueAt)}
              </span>
            </div>

            {/* 矩阵表 */}
            <div className="bg-white rounded-lg border border-[#E9E9E9] overflow-auto">
              <table className="text-[12.5px] border-collapse min-w-full">
                <thead className="bg-[#F7F8FA]">
                  {/* 分组行 */}
                  <tr className="text-[#6B7280]">
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-20 bg-[#F7F8FA] px-3 py-2 text-left font-medium border-b border-r border-[#EAECEF] min-w-[150px]"
                    >
                      单位 / 对象
                    </th>
                    <th
                      rowSpan={2}
                      className="px-3 py-2 text-left font-medium border-b border-[#EAECEF] whitespace-nowrap"
                    >
                      责任人
                    </th>
                    <th
                      rowSpan={2}
                      className="px-3 py-2 text-left font-medium border-b border-r border-[#EAECEF] whitespace-nowrap"
                    >
                      状态
                    </th>
                    {groups.map((g) => (
                      <th
                        key={g.key}
                        colSpan={g.fields.length}
                        className="px-3 py-1.5 text-center font-semibold text-[var(--party-primary)] border-b border-r border-[#EAECEF] whitespace-nowrap"
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                  {/* 字段行 */}
                  <tr className="text-[#475467]">
                    {flatFields.map((f) => (
                      <th
                        key={f.code}
                        className="px-3 py-1.5 text-left font-medium border-b border-r border-[#EAECEF] whitespace-nowrap min-w-[110px]"
                        title={f.description}
                      >
                        {f.label}
                        {f.unit ? <span className="text-[#9CA3AF]"> ({f.unit})</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <SummaryRow key={r.targetId} row={r} fields={flatFields} />
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3 + flatFields.length}
                        className="px-3 py-8 text-center text-[#9CA3AF]"
                      >
                        暂无派发对象
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* 合计行 */}
                <tfoot>
                  <tr className="bg-[#FBFCFE] font-semibold text-[#172033]">
                    <td className="sticky left-0 z-10 bg-[#FBFCFE] px-3 py-2 border-t border-r border-[#EAECEF]">
                      合计
                    </td>
                    <td className="px-3 py-2 border-t border-[#EAECEF]" />
                    <td className="px-3 py-2 border-t border-r border-[#EAECEF] text-[11px] text-[#6B7280]">
                      {data.counts.filled}/{data.counts.total} 已填报
                    </td>
                    {flatFields.map((f) => {
                      const t = data.numberTotals[f.code];
                      return (
                        <td
                          key={f.code}
                          className="px-3 py-2 border-t border-r border-[#EAECEF] text-right tabular-nums"
                        >
                          {t ? (
                            <span className="text-[var(--party-primary)]">
                              {fmtNum(t.sum, t.decimals)}
                              {t.unit ? (
                                <span className="text-[#9CA3AF] font-normal"> {t.unit}</span>
                              ) : null}
                            </span>
                          ) : (
                            ""
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="text-[11px] text-[#9CA3AF] flex items-center gap-1.5">
              合计仅统计「已提交 / 已通过」的回执;附件单元格点文件名即可下载。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ row, fields }: { row: TaskSummaryRow; fields: TaskField[] }) {
  const filled = row.submissionStatus === "submitted" || row.submissionStatus === "approved";
  return (
    <tr className={`border-b border-[#F2F4F7] ${filled ? "" : "bg-[#FCFCFD]"}`}>
      <td className="sticky left-0 z-10 bg-inherit px-3 py-2 border-r border-[#EAECEF] font-medium text-[#172033] whitespace-nowrap">
        {row.targetName}
      </td>
      <td className="px-3 py-2 text-[#475467] whitespace-nowrap">{row.ownerName ?? "—"}</td>
      <td className="px-3 py-2 border-r border-[#EAECEF] whitespace-nowrap">
        <span className="text-[11px] px-1.5 py-0.5 rounded" style={taskStatusChip(row.status)}>
          {TASK_TARGET_STATUS_LABEL[row.status] ?? row.status}
        </span>
      </td>
      {fields.map((f) => (
        <td key={f.code} className="px-3 py-2 border-r border-[#F2F4F7] align-top text-[#172033]">
          {filled ? (
            <SummaryCell field={f} value={row.values[f.code]} />
          ) : (
            <span className="text-[#D1D5DB]">—</span>
          )}
        </td>
      ))}
    </tr>
  );
}
