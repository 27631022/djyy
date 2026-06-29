import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderCog, Wrench } from "lucide-react";
import { assessmentApi } from "../api";

/** 「我维护的考核」(人人可见):节点管理员入口 —— 列出我被指定为「节点管理员」的考核表 + 我管的节点,点进维护该节点子树。 */
export default function MyManagedSchemes() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["assessment", "my-managed"],
    queryFn: () => assessmentApi.myManagedSchemes(),
  });
  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FolderCog className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-lg font-semibold text-[#172033]">我维护的考核</h1>
      </div>
      <p className="text-[13px] text-[#6B7280] mb-4">
        下面是把你设为「节点管理员」的考核表。点对应节点进去,可维护本节点及其下全部子指标(名称/分值/数据源/计分工具/责任人/评分标准等),只能动你管的这一块。
      </p>

      {isLoading ? (
        <div className="py-16 text-center text-[#9CA3AF]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-[#9CA3AF] rounded-xl border border-[#eef2f7] bg-white">
          暂无你维护的考核节点。管理员在考核设计页把某个指标节点的「节点管理员」设为你之后,会出现在这里。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <div key={s.id} className="rounded-xl border border-[#eef2f7] bg-white p-4">
              <div className="font-semibold text-[#172033]">{s.name}</div>
              <div className="text-[12px] text-[#6B7280] mt-0.5 mb-2">{s.year} 年</div>
              <div className="flex flex-wrap gap-2">
                {s.nodes.map((n) => (
                  <button
                    key={n.code}
                    type="button"
                    onClick={() => navigate(`/admin/assessment/schemes/${s.id}/node/${encodeURIComponent(n.code)}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] border border-[#dce4ef] text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-party-soft"
                  >
                    <Wrench className="w-3.5 h-3.5" /> 维护「{n.label}」
                    <ChevronRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
