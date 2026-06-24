import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { assessmentApi, assessmentErrorMessage, type MyConfirmItem } from "../api";

/** 「考核确认」(人人可见):责任人核对自己负责的指标分数 → 点「确认无误」声明已完成本指标打分。 */
export default function MyConfirmations() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["assessment", "my-confirmations"],
    queryFn: () => assessmentApi.myConfirmations(),
  });
  const confirm = useMutation({
    mutationFn: (it: MyConfirmItem) => assessmentApi.confirmIndicator(it.roundId, it.leafCode),
    onSuccess: () => {
      toast.success("已确认");
      qc.invalidateQueries({ queryKey: ["assessment", "my-confirmations"] });
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "确认失败")),
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const pendingCount = items.filter((i) => i.status !== "confirmed").length;
  const byRound = useMemo(() => {
    const m = new Map<string, { name: string; year: number | null; items: MyConfirmItem[] }>();
    for (const it of items) {
      const g = m.get(it.roundId) ?? { name: it.roundName, year: it.year, items: [] };
      g.items.push(it);
      m.set(it.roundId, g);
    }
    return [...m.entries()];
  }, [items]);

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardCheck className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-lg font-semibold text-[#172033]">考核确认</h1>
      </div>
      <p className="text-[13px] text-[#6B7280] mb-4">
        核对你负责的指标分数,确认「已完成本指标打分」。
        {pendingCount > 0 ? <span className="text-red-500 font-medium"> 待确认 {pendingCount} 项。</span> : " 全部已确认。"}
      </p>

      {isLoading ? (
        <div className="py-16 text-center text-[#9CA3AF]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-[#9CA3AF] rounded-xl border border-[#eef2f7] bg-white">
          暂无待你确认的考核指标。管理员发起分数确认后会出现在这里。
        </div>
      ) : (
        <div className="space-y-4">
          {byRound.map(([roundId, g]) => (
            <div key={roundId} className="rounded-xl border border-[#eef2f7] bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#eef2f7] bg-[#FBFBFC]">
                <span className="text-[14px] font-semibold text-[#172033]">{g.name}</span>
                {g.year && <span className="ml-2 text-[12px] text-[#9CA3AF]">{g.year} 年</span>}
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                {g.items.map((it) => (
                  <div key={it.leafCode} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-[#172033] truncate">{it.leafLabel}</div>
                      {it.groupLabel && it.groupLabel !== it.leafLabel && (
                        <div className="text-[11px] text-[#9CA3AF]">{it.groupLabel}</div>
                      )}
                    </div>
                    {it.status === "confirmed" ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4" /> 已确认
                        {it.confirmedAt ? ` · ${it.confirmedAt.slice(5, 16).replace("T", " ")}` : ""}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => confirm.mutate(it)}
                        disabled={confirm.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[13px] font-medium disabled:opacity-60 flex-shrink-0"
                        style={{ backgroundColor: "var(--party-primary)" }}
                      >
                        <CheckCircle2 className="w-4 h-4" /> 确认无误
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
