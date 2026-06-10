import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, ArmchairIcon, CalendarIcon, UsersIcon, Trash2Icon, LayoutGridIcon } from "lucide-react";
import { toast } from "sonner";
import { seatingApi } from "../api";

const PARTY = "var(--party-primary)";
const STATUS_LABEL: Record<string, string> = { draft: "草稿", computed: "已排座", finalized: "已定稿" };

export default function SeatingPlanList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const plansQuery = useQuery({ queryKey: ["venue", "plans"], queryFn: () => seatingApi.list() });

  /* 新建会议 = 进向导草稿态(planId="new"),不立刻建记录;向导第1步「下一步」才真正创建。
     避免「点进去看一眼就白多一条会议记录」。 */
  const startNew = () => navigate("/admin/venue/seating/new/wizard");

  const delMut = useMutation({
    mutationFn: (id: string) => seatingApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "plans"] });
      toast.success("已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const plans = plansQuery.data ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
            <ArmchairIcon className="w-5 h-5" style={{ color: PARTY }} />
            会议管理
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-0.5">新建会议 → 填会议信息 → 选座次图 → 导名单 → 分区 → 一键排座。</p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-4 h-4" />
          新建会议
        </button>
      </div>

      {plansQuery.isLoading && <div className="text-sm text-[#9CA3AF]">加载中…</div>}
      {!plansQuery.isLoading && plans.length === 0 && (
        <div className="border border-dashed border-[#E9E9E9] rounded-xl p-12 text-center text-[#9CA3AF]">
          <ArmchairIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          还没有会议排座。点右上角「新建会议」开始。
        </div>
      )}

      <div className="space-y-2">
        {plans.map((p) => (
          <div
            key={p.id}
            // 已排座/已定稿的会议直接落到「排座」步,方便领导审核后回来微调;草稿从头开始
            onClick={() => navigate(`/admin/venue/seating/${p.id}/wizard${p.status === "draft" ? "" : "?step=6"}`)}
            title={p.status === "draft" ? "继续编辑" : "打开微调(各步骤可点步骤栏跳转修改)"}
            className="group bg-white border border-[#E9E9E9] rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-[var(--party-primary)] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#1A1A1A] truncate">{p.name}</div>
              <div className="flex items-center gap-3 mt-1 text-xs text-[#9CA3AF] flex-wrap">
                <span className="flex items-center gap-1">
                  <LayoutGridIcon className="w-3.5 h-3.5" />
                  {p.roomName} · {p.layoutName}
                </span>
                <span className="flex items-center gap-1">
                  <UsersIcon className="w-3.5 h-3.5" />
                  {p.attendeeCount} 人
                </span>
                {p.eventDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {p.eventDate.slice(0, 10)}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-party-soft text-[var(--party-primary)] flex-shrink-0">
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`删除会议排座「${p.name}」?`)) delMut.mutate(p.id);
              }}
              className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#EF4444] opacity-0 group-hover:opacity-100 flex-shrink-0"
              title="删除"
            >
              <Trash2Icon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
