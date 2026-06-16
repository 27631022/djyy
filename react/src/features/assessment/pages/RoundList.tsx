import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Trash2 } from "lucide-react";
import { assessmentApi, assessmentErrorMessage, parseRoundTargets, type AssessmentRound } from "../api";

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "填报中", cls: "bg-amber-50 text-amber-700" },
  done: { label: "已计算", cls: "bg-emerald-50 text-emerald-700" },
};

export default function RoundList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["assessment", "rounds"], queryFn: () => assessmentApi.listRounds() });
  const rounds = useMemo(() => data ?? [], [data]);

  const del = useMutation({
    mutationFn: (id: string) => assessmentApi.deleteRound(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["assessment", "rounds"] });
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "删除失败")),
  });

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#172033] flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-[var(--party-primary)]" /> 考核打分
        </h1>
        <p className="text-[13px] text-[#6B7280] mt-1">
          从「考核表」点「发起考核」生成一次轮次,在这里给各单位录入原始值 → 计算 → 看得分 / 排名 / 定级。
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#9CA3AF]">加载中…</div>
      ) : rounds.length === 0 ? (
        <div className="py-16 text-center text-[#9CA3AF]">
          还没有发起任何考核。去「考核表」点某张表卡片上的「发起考核」。
        </div>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <RoundRow key={r.id} round={r} onOpen={() => navigate(`/admin/assessment/rounds/${r.id}`)} onDelete={() => del.mutate(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoundRow({ round, onOpen, onDelete }: { round: AssessmentRound; onOpen: () => void; onDelete: () => void }) {
  const st = STATUS[round.status] ?? { label: round.status, cls: "bg-[#f1f5f9] text-[#475467]" };
  const targetCount = parseRoundTargets(round).length;
  return (
    <div
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl border border-[#eef2f7] bg-white p-3.5 cursor-pointer hover:border-[var(--party-primary)]/40 hover:shadow-sm transition-all"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[#172033] truncate">{round.name}</div>
        <div className="text-[12px] text-[#6B7280] mt-0.5">
          {round.year} 年 · {targetCount} 个考核对象
        </div>
      </div>
      <span className={`px-2 py-0.5 rounded-full text-[11px] flex-shrink-0 ${st.cls}`}>{st.label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`删除考核轮次「${round.name}」?`)) onDelete();
        }}
        className="p-1.5 rounded-md text-[#94a3b8] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
        title="删除"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
