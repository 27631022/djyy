import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  XIcon,
  UserIcon,
  PhoneIcon,
  Building2Icon,
  ClockIcon,
  FileTextIcon,
  ImageIcon,
  DownloadIcon,
  CheckCircle2Icon,
  Undo2Icon,
  Loader2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import {
  taskApi,
  groupTaskFields,
  taskApiErrorMessage,
  type TaskField,
  type TaskSubmissionDetail,
} from "../api";

function fmt(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

/** 已上传文件项(填报值 file/image:{id,name}[]) */
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

/** 单个字段的填报值(只读展示) */
function FieldValue({ field, value }: { field: TaskField; value: unknown }) {
  if (field.type === "file" || field.type === "image") {
    const files = asFiles(value);
    if (files.length === 0) return <span className="text-[#C0C6D0]">—</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {files.map((f, i) => (
          <button
            key={f.id + i}
            type="button"
            onClick={() => downloadFile(f)}
            className="inline-flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-md border border-[#dce4ef] bg-white text-xs hover:border-[var(--party-primary)] max-w-[260px]"
            title={`下载 ${f.name}`}
          >
            {field.type === "image" ? (
              <ImageIcon className="w-3.5 h-3.5 text-[#1A6BC8] flex-shrink-0" />
            ) : (
              <FileTextIcon className="w-3.5 h-3.5 text-[#1A6BC8] flex-shrink-0" />
            )}
            <span className="truncate text-[#172033]">{f.name}</span>
            <DownloadIcon className="w-3 h-3 text-[#9CA3AF] flex-shrink-0" />
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "doclink") {
    const done = value === true;
    return (
      <div className="space-y-1">
        <span
          className={`inline-flex items-center gap-1 text-[13px] ${
            done ? "text-[#047857]" : "text-[#B45309]"
          }`}
        >
          {done ? <CheckCircle2Icon className="w-3.5 h-3.5" /> : null}
          {done ? "已完成在线填写" : "未完成在线填写"}
        </span>
        {field.link && (
          <a
            href={field.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[12px] text-[#1A6BC8] hover:underline break-all"
          >
            <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" />
            {field.link}
          </a>
        )}
      </div>
    );
  }

  // text / textarea / number / date / select / richtext → 文本
  const empty = value === null || value === undefined || value === "";
  if (empty) return <span className="text-[#C0C6D0]">—</span>;
  let text = String(value);
  if (field.type === "number" && field.unit) text = `${text} ${field.unit}`;
  const multiline = field.type === "textarea" || field.type === "richtext";
  return (
    <div
      className={`text-[13px] text-[#172033] ${
        multiline ? "whitespace-pre-wrap bg-[#f7f9fc] border border-[#eef1f6] rounded-md px-2.5 py-2" : ""
      }`}
    >
      {text}
    </div>
  );
}

/**
 * 审核抽屉(派发人侧):右侧滑出,展示某派发对象的填报内容(只读)+ 通过/退回。
 * - submitted → 显示 通过 / 退回(退回必填原因)
 * - returned  → 已退回(显示退回原因,只读)
 * - done      → 已通过(只读)
 */
export function ReviewDrawer({
  targetId,
  onClose,
}: {
  targetId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const q = useQuery({
    queryKey: ["task-submission", targetId],
    queryFn: () => taskApi.getSubmission(targetId),
  });

  const review = useMutation({
    mutationFn: (decision: "approve" | "return") =>
      taskApi.review(targetId, decision, note.trim() || undefined),
    onSuccess: (_, decision) => {
      toast.success(decision === "approve" ? "已通过" : "已退回,等待责任人重填");
      qc.invalidateQueries({ queryKey: ["task"] });
      qc.invalidateQueries({ queryKey: ["task-submission", targetId] });
      onClose();
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "审核失败")),
  });

  const data: TaskSubmissionDetail | undefined = q.data;
  const groups = data ? groupTaskFields(data.fields) : [];
  const formData = data?.submission?.formData ?? {};
  const canReview = data?.targetStatus === "submitted";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* 头 */}
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-[#E9E9E9] flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[#1A1A1A] truncate">回执审核</div>
            <div className="text-[12px] text-[#9CA3AF] truncate">{data?.taskTitle ?? ""}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] flex-shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* 体 */}
        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4">
          {q.isLoading ? (
            <div className="py-10 text-center text-sm text-[#9CA3AF]">加载中…</div>
          ) : !data ? (
            <div className="py-10 text-center text-sm text-[#9CA3AF]">回执不存在</div>
          ) : (
            <>
              {/* 对象 + 责任人 */}
              <div className="rounded-lg border border-[#E9E9E9] bg-[#FBFCFE] px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1A1A1A]">
                  {data.targetType === "org" ? (
                    <Building2Icon className="w-4 h-4 text-[#1A6BC8]" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-[var(--party-primary)]" />
                  )}
                  {data.targetName}
                  {data.handlerOrgName && (
                    <span className="text-[12px] font-normal text-[#9CA3AF]">
                      · {data.handlerOrgName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap text-[12px] text-[#6B7280]">
                  {data.ownerName && (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {data.ownerName}
                    </span>
                  )}
                  {data.ownerPhone && (
                    <a
                      href={`tel:${data.ownerPhone}`}
                      className="inline-flex items-center gap-1 text-[#1A6BC8] hover:underline"
                    >
                      <PhoneIcon className="w-3 h-3" />
                      {data.ownerPhone}
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    提交于 {fmt(data.submission?.submittedAt ?? null)}
                  </span>
                </div>
              </div>

              {/* 已退回 / 已通过 提示 */}
              {data.targetStatus === "returned" && (
                <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">
                  <div className="font-semibold mb-0.5">已退回,等待责任人重填</div>
                  {data.submission?.reviewNote && (
                    <div className="whitespace-pre-wrap">退回原因:{data.submission.reviewNote}</div>
                  )}
                </div>
              )}
              {data.targetStatus === "done" && (
                <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-[13px] text-[#047857]">
                  <span className="font-semibold">已通过</span>
                  {data.submission?.reviewNote ? ` · 备注:${data.submission.reviewNote}` : ""}
                  {data.submission?.reviewedAt ? ` · ${fmt(data.submission.reviewedAt)}` : ""}
                </div>
              )}

              {/* 填报内容(只读) */}
              {groups.map((g) => (
                <div key={g.key} className="space-y-2.5">
                  <div className="text-[12px] font-bold text-[var(--party-primary)] border-l-2 border-[var(--party-primary)] pl-2">
                    {g.label}
                  </div>
                  <div className="space-y-3 pl-1">
                    {g.fields.map((f) => (
                      <div key={f.code}>
                        <div className="text-[12px] text-[#6B7280] mb-1">
                          {f.label}
                          {f.required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
                        </div>
                        <FieldValue field={f} value={formData[f.code]} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {data.fields.length === 0 && (
                <div className="text-[13px] text-[#9CA3AF] text-center py-4">该任务无填报字段</div>
              )}
            </>
          )}
        </div>

        {/* 底:审核操作(仅 submitted) */}
        {canReview && (
          <div className="flex-shrink-0 border-t border-[#E9E9E9] p-4 space-y-2.5 bg-[#FBFBFC]">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="退回原因(退回重填时必填;通过可留空作备注)"
              className="w-full text-[13px] rounded-md border border-[#dce4ef] px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-party-primary-20"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={review.isPending}
                onClick={() => {
                  if (!note.trim()) {
                    toast.error("退回必须填写退回原因");
                    return;
                  }
                  review.mutate("return");
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[#FECACA] text-[13px] font-medium text-[#DC2626] bg-white hover:bg-[#FEF2F2] disabled:opacity-50"
              >
                <Undo2Icon className="w-4 h-4" />
                退回重填
              </button>
              <button
                type="button"
                disabled={review.isPending}
                onClick={() => review.mutate("approve")}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--party-primary)" }}
              >
                {review.isPending ? (
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2Icon className="w-4 h-4" />
                )}
                通过
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
