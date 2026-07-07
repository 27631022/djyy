import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircleWarningIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { showcaseApi } from "../../api";
import { FeedbackCard } from "../../components/FeedbackCard";

/** 后台 · 吐槽处理:管理员看全部(晒台+作品),回复 / 关闭(台主/作者在前台详情页也能收到并处理)。 */
export default function ShowcaseFeedback() {
  const [status, setStatus] = useState("open");
  const list = useQuery({
    queryKey: ["showcase", "feedback", "all", status],
    queryFn: () => showcaseApi.listFeedback("all", status === "all" ? undefined : status),
  });

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <MessageCircleWarningIcon className="h-5 w-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">晒场吐槽处理</h1>
      </div>
      <p className="mb-4 text-sm text-gray-400">
        对晒台/参晒作品的吐槽(不公开)。回复后吐槽人、台主/作者可见;匿名吐槽对所有人隐名。
      </p>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="open">待处理</TabsTrigger>
          <TabsTrigger value="replied">已回复</TabsTrigger>
          <TabsTrigger value="closed">已关闭</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3">
        {list.isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">没有吐槽</div>
        ) : (
          list.data!.map((f) => <FeedbackCard key={f.id} fb={f} />)
        )}
      </div>
    </div>
  );
}
