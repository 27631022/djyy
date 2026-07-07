import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircleWarningIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { knowledgeApi } from "../../api";
import { FeedbackCard } from "../../components/FeedbackCard";

/** 用户反馈(吐槽)处理:管理员看全部,回复 / 关闭。 */
export default function KnowledgeFeedback() {
  const [status, setStatus] = useState("open");
  const list = useQuery({
    queryKey: ["knowledge", "feedback", "all", status],
    queryFn: () => knowledgeApi.listFeedback("all", status === "all" ? undefined : status),
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircleWarningIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">用户反馈</h1>
      </div>
      <p className="text-sm text-gray-400 mb-4">读者对文章的意见/吐槽(不公开)。回复后作者与反馈人可见。</p>

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
          <div className="py-16 text-center text-sm text-gray-400">没有反馈</div>
        ) : (
          list.data!.map((f) => <FeedbackCard key={f.id} fb={f} />)
        )}
      </div>
    </div>
  );
}
