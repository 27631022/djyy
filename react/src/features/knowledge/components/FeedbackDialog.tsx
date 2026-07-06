import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircleWarningIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { knowledgeApi, knowledgeErrMsg } from "../api";

/** 吐槽 / 意见反馈弹窗:不公开,仅作者与管理员可见并回复;可选匿名。 */
export function FeedbackDialog({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const submit = useMutation({
    mutationFn: () => knowledgeApi.addFeedback(articleId, { content: content.trim(), anonymous }),
    onSuccess: () => {
      toast.success("反馈已提交,作者/管理员会看到");
      onClose();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "提交失败")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <MessageCircleWarningIcon className="w-4 h-4 text-amber-500" /> 吐槽 / 意见反馈
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-gray-400 -mt-1">
          反馈<span className="text-gray-600 font-medium">不公开</span>,只有文章作者和管理员能看到并回复。内容有错、过时、看不懂都可以提。
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="说说这篇有什么问题、可以怎么改进…"
          className="text-sm"
          autoFocus
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <Switch checked={anonymous} onCheckedChange={setAnonymous} /> 匿名反馈(作者/管理员看不到你是谁)
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            className="bg-[var(--party-primary)] hover:opacity-90 text-white"
            disabled={!content.trim() || submit.isPending}
            onClick={() => submit.mutate()}
          >
            提交反馈
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
