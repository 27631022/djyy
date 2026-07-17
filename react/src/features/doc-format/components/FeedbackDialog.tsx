import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { docInteractionApi } from "../api";

/** 与后端 FEEDBACK_MAX_FILES 对齐 */
const MAX_FILES = 5;

/**
 * 转换问题反馈(照 knowledge/showcase 的 FeedbackDialog,但**多了附件**)。
 *
 * 本模块的反馈专收「转换不成功」的问题,所以核心是让用户把**转不了的原始文件**一起带上来 ——
 * 没有样本就没法复现,反馈也就没用。文件先经 storage 传好拿 fileId,再随 JSON 提交
 * (不把 dialog 改成 multipart,与另两家的形状保持一致)。
 */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [files, setFiles] = useState<{ fileId: string; fileName: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: docInteractionApi.uploadSample,
    onSuccess: (r) => setFiles((f) => [...f, r]),
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "文件上传失败",
      ),
  });

  const submit = useMutation({
    mutationFn: () =>
      docInteractionApi.addFeedback({
        content,
        anonymous,
        fileIds: files.map((f) => f.fileId),
      }),
    onSuccess: () => {
      toast.success("反馈已送达,管理员会看到。带了原始文件的话我们能直接复现问题");
      onClose();
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "提交失败",
      ),
  });

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (files.length >= MAX_FILES) {
      toast.error(`最多带 ${MAX_FILES} 个文件`);
      return;
    }
    upload.mutate(f);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>反馈转换问题</DialogTitle>
          <DialogDescription>
            哪儿转得不对?结构认错了、字体不对、格式乱了都可以说。反馈不公开,只有管理员看得到。
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如:这份 OA 下载的文件,标题被认成正文了 / 第三条的字体不对 / 上传就报错…"
          className="min-h-28"
          maxLength={2000}
        />

        {/* 失败样本 —— 这是本模块反馈的核心 */}
        <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-xs text-amber-900">
            <b>请把转换不成功的原始文件一起传上来</b> —— 没有样本我们没法复现问题。
            文件只有管理员能看到,用完就用于修复。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {files.map((f) => (
              <span
                key={f.fileId}
                className="flex items-center gap-1 rounded bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-amber-200"
              >
                <Paperclip className="h-3 w-3" />
                {f.fileName}
                <button
                  type="button"
                  onClick={() => setFiles((x) => x.filter((y) => y.fileId !== f.fileId))}
                  className="ml-0.5 text-slate-400 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {files.length < MAX_FILES && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={upload.isPending}
                onClick={() => inputRef.current?.click()}
                className="h-7 text-xs"
              >
                {upload.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Paperclip className="mr-1 h-3 w-3" />
                )}
                添加文件
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = ""; // 允许重复选同一个文件
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Switch checked={anonymous} onCheckedChange={setAnonymous} />
            匿名反馈
          </label>
          <Button
            // 上传没完成就禁用提交 —— 否则用户点了会把还没传完的附件静默丢掉
            disabled={!content.trim() || submit.isPending || upload.isPending}
            onClick={() => submit.mutate()}
            className="bg-[var(--party-primary)] text-white hover:opacity-90"
          >
            {submit.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {upload.isPending ? "附件上传中…" : "提交"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
