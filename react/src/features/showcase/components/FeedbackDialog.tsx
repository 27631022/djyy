import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { showcaseApi, showcaseErrMsg, type ShowcaseTargetType } from "../api";

/** 吐槽弹窗(照 knowledge FeedbackDialog):不公开,仅台主/作者/管理员可见并回复;可匿名 */
export function FeedbackDialog({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ShowcaseTargetType;
  targetId: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const submit = useMutation({
    mutationFn: () => showcaseApi.addFeedback(targetType, targetId, { content: content.trim(), anonymous }),
    onSuccess: () => {
      toast.success("吐槽已送达,台主/管理员会看到");
      onClose();
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "提交失败")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>吐个槽</DialogTitle>
          <DialogDescription>
            不公开显示 —— 只有{targetType === "stage" ? "台主" : "作者、台主"}和管理员能看到并回复
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={targetType === "stage" ? "对这个晒台有什么意见建议…" : "对这件作品有什么想说的…"}
          className="min-h-28"
          maxLength={2000}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={anonymous} onCheckedChange={setAnonymous} />
          匿名吐槽
        </label>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            className="bg-[var(--party-primary)] text-white hover:opacity-90"
            disabled={!content.trim() || submit.isPending}
            onClick={() => submit.mutate()}
          >
            提交吐槽
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
