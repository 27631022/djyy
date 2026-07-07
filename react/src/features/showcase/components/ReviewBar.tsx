import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { showcaseApi, showcaseErrMsg, type ShowcaseTargetType } from "../api";

/**
 * 审核条(晒台/作品共用):通过 / 驳回(理由必填,弹窗)。
 * 成功后级联失效 showcase 缓存;onDone 供页面额外跳转/提示。
 */
export function ReviewBar({
  kind,
  id,
  onDone,
  compact = false,
}: {
  kind: ShowcaseTargetType;
  id: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const review = useMutation({
    mutationFn: (data: { approve: boolean; reason?: string }): Promise<unknown> =>
      kind === "stage" ? showcaseApi.reviewStage(id, data) : showcaseApi.reviewEntry(id, data),
    onSuccess: (_r, vars) => {
      toast.success(vars.approve ? "已通过并公开" : "已驳回");
      qc.invalidateQueries({ queryKey: ["showcase"] });
      setRejectOpen(false);
      setReason("");
      onDone?.();
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "审核操作失败")),
  });

  return (
    <>
      <div className={compact ? "flex items-center gap-1.5" : "flex items-center gap-2"}>
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={review.isPending}
          onClick={() => review.mutate({ approve: true })}
        >
          <Check className="mr-1 h-4 w-4" />
          通过
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-200 text-red-600 hover:bg-red-50"
          disabled={review.isPending}
          onClick={() => setRejectOpen(true)}
        >
          <X className="mr-1 h-4 w-4" />
          驳回
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>驳回{kind === "stage" ? "晒台" : "参晒作品"}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="填写驳回原因(必填,提交人会看到)"
            className="min-h-24"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={!reason.trim() || review.isPending}
              onClick={() => review.mutate({ approve: false, reason: reason.trim() })}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
