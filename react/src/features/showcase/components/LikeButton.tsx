import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { showcaseApi, showcaseErrMsg, type ShowcaseTargetType } from "../api";

/**
 * 点赞按钮(晒台/作品两级共用):每个账户对同一对象只能点一次,再点=取消。
 * 成功后用后端权威 ReactionState 就地更新详情缓存(setQueryData),
 * 并级联失效 榜单/作品流/晒台流(likes 排位随点赞实时变)。
 */
export function LikeButton({
  kind,
  id,
  liked,
  likeCount,
}: {
  kind: ShowcaseTargetType;
  id: string;
  liked: boolean;
  likeCount: number;
}) {
  const qc = useQueryClient();
  const detailKey = [kind === "stage" ? "stage" : "entry", id];

  const react = useMutation({
    mutationFn: (on: boolean) => showcaseApi.setReaction(kind, id, on),
    onSuccess: (state) => {
      qc.setQueryData<Record<string, unknown>>(["showcase", ...detailKey], (cur) =>
        cur ? { ...cur, liked: state.liked, likeCount: state.likeCount } : cur,
      );
      qc.invalidateQueries({ queryKey: ["showcase", "ranking"] });
      qc.invalidateQueries({ queryKey: ["showcase", "entries"] });
      qc.invalidateQueries({ queryKey: ["showcase", "stages"] });
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "操作失败")),
  });

  return (
    <button
      type="button"
      disabled={react.isPending}
      onClick={() => react.mutate(!liked)}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        liked
          ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
      }`}
      title={liked ? "取消点赞" : "点赞(每人一次)"}
    >
      <ThumbsUp className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
      {liked ? "已赞" : "点赞"} {likeCount}
    </button>
  );
}
