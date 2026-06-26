import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, ClipboardList } from "lucide-react";
import { assessmentApi } from "../api";

/** 「我的考核」(人人可见):打分人入口 —— 列出我有负责指标的考核,点进直达打分页(自动过滤到我负责的指标)。 */
export default function MyAssessments() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["assessment", "my-assessments"],
    queryFn: () => assessmentApi.myAssessments(),
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const pendingTotal = items.reduce((s, it) => s + it.myPending, 0);

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-lg font-semibold text-[#172033]">我的考核</h1>
      </div>
      <p className="text-[13px] text-[#6B7280] mb-4">
        下面是需要你打分的考核。点进去录入你负责的指标,完成后在打分页点「确认完成」。
        {pendingTotal > 0 ? (
          <span className="text-red-500 font-medium"> 待确认 {pendingTotal} 项。</span>
        ) : items.length ? (
          " 全部已确认。"
        ) : (
          ""
        )}
      </p>

      {isLoading ? (
        <div className="py-16 text-center text-[#9CA3AF]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-[#9CA3AF] rounded-xl border border-[#eef2f7] bg-white">
          暂无需要你打分的考核。管理员发起考核、并把某项指标的「考核责任人」设为你之后,会出现在这里。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <button
              key={it.roundId}
              type="button"
              onClick={() => navigate(`/admin/assessment/rounds/${it.roundId}`)}
              className="w-full flex items-center gap-3 rounded-xl border border-[#eef2f7] bg-white p-4 text-left hover:border-[var(--party-primary)]/40 hover:shadow-sm transition-all"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#172033] truncate">{it.name}</div>
                <div className="text-[12px] text-[#6B7280] mt-1">
                  {it.year} 年 · 我负责 {it.myLeaves} 项指标
                </div>
              </div>
              {it.myPending === 0 ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" /> 已确认完成
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[12px] bg-red-50 text-red-500 font-medium flex-shrink-0">
                  待确认 {it.myPending}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
