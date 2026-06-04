import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  XIcon,
  Building2Icon,
  UserIcon,
  ClockIcon,
  FileTextIcon,
  DownloadIcon,
  CheckIcon,
  Loader2Icon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { downloadBlob } from "@/shared/lib/download";
import { taskApi, type TaskConfirmQueueItem } from "../api";
import { TaskFormPreview } from "./TaskFormPreview";
import { DueBadge } from "./DueBadge";

/**
 * 平级确认「看任务内容」抽屉(部门负责人侧):右侧滑出。
 * 负责人确认前需要看到「到底是什么任务」—— 填报要求 + 通知文件 + 填报表单结构(空白预览);
 * 底部就地「同意下发 / 驳回」(驳回必填原因)。内容只读,不暴露其他单位回执。
 */
export function ConfirmDrawer({
  item,
  busy,
  onClose,
  onConfirm,
}: {
  item: TaskConfirmQueueItem;
  busy: boolean;
  onClose: () => void;
  onConfirm: (decision: "approve" | "reject", note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const q = useQuery({
    queryKey: ["task", item.taskId],
    queryFn: () => taskApi.get(item.taskId),
  });
  const task = q.data;

  const otherApproved = item.asReceiver
    ? item.senderConfirm === "approved"
    : item.receiverConfirm === "approved";

  async function downloadNotice() {
    if (!task?.noticeFileId) return;
    try {
      const blob = await storageApi.fetchBlob(task.noticeFileId);
      downloadBlob(blob, task.noticeFileName ?? "通知文件");
    } catch {
      toast.error("下载失败");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* 头 */}
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-[#E9E9E9] flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[#1A1A1A] truncate">任务内容 · 平级确认</div>
            <div className="text-[12px] text-[#9CA3AF] truncate">{item.title}</div>
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
          {/* 派发链路信息 */}
          <div className="rounded-lg border border-[#FED7AA] bg-[#FFFBF5] px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[13px] text-[#172033]">
              <Building2Icon className="w-4 h-4 text-[#C2410C]" />
              <span className="font-semibold">{item.dispatchOrgName ?? "—"}</span>
              <span className="text-[#9CA3AF]">→</span>
              <span className="font-semibold">{item.targetOrgName ?? "—"}</span>
              <span
                className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "#FEF3C7", color: "#B45309" }}
              >
                {item.side === "receiver" ? "派给本部门" : "本部门派出"}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[12px] text-[#6B7280]">
              {item.dispatchUserName && (
                <span className="inline-flex items-center gap-1">
                  <UserIcon className="w-3 h-3" />派发人 {item.dispatchUserName}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />截止 <DueBadge dueAt={item.dueAt} showDate />
              </span>
              {otherApproved && (
                <span className="text-[#047857] font-medium">对方部门负责人已同意</span>
              )}
            </div>
          </div>

          {q.isLoading ? (
            <div className="py-10 text-center text-sm text-[#9CA3AF]">加载任务内容…</div>
          ) : !task ? (
            <div className="py-10 text-center text-sm text-[#9CA3AF]">任务不存在</div>
          ) : (
            <>
              {/* 通知文件 + 描述 + 填报要求 */}
              {(task.noticeFileId || task.description || task.notes) && (
                <div className="space-y-3">
                  {task.noticeFileId && (
                    <button
                      type="button"
                      onClick={downloadNotice}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] text-[13px] text-[#1A6BC8]"
                    >
                      <FileTextIcon className="w-3.5 h-3.5" />
                      {task.noticeFileName ?? "通知文件"}
                      <DownloadIcon className="w-3 h-3" />
                    </button>
                  )}
                  {task.description && (
                    <p className="text-sm text-[#4B5563] whitespace-pre-wrap">{task.description}</p>
                  )}
                  {task.notes && (
                    <div>
                      <div className="text-[12px] font-bold text-[#475467] mb-1">填报要求</div>
                      <p className="text-sm text-[#344054] whitespace-pre-wrap bg-[#f7f9fc] border border-[#dce4ef] rounded-md px-3 py-2">
                        {task.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 填报表单结构(空白预览 —— 本部门接收后要填的内容) */}
              <div>
                <div className="text-[12px] font-bold text-[#475467] mb-2">
                  填报表单(本部门接收后需填写)
                </div>
                <TaskFormPreview fields={task.fields} />
              </div>
            </>
          )}
        </div>

        {/* 底:确认操作 */}
        <div className="flex-shrink-0 border-t border-[#E9E9E9] p-4 space-y-2.5 bg-[#FBFBFC]">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="驳回原因(驳回时必填;同意可留空)"
            className="w-full text-[13px] rounded-md border border-[#dce4ef] px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-party-primary-20"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!note.trim()) {
                  toast.error("驳回必须填写原因");
                  return;
                }
                onConfirm("reject", note.trim());
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[#FCA5A5] text-[13px] font-bold text-[#DC2626] bg-white hover:bg-[#FEF2F2] disabled:opacity-50"
            >
              <XIcon className="w-4 h-4" />驳回
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm("approve")}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "#059669" }}
            >
              {busy ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <CheckIcon className="w-4 h-4" />
              )}
              同意下发
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
