import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Megaphone, Trophy } from "lucide-react";
import { useAuth } from "@/stores/auth";
import {
  ENTRY_STATUS_CHIP,
  ENTRY_STATUS_LABEL,
  showcaseApi,
} from "../api";
import { StageCard } from "../components/StageCard";

/** 我的参晒 / 我的晒台(/showcase/mine):两 tab,状态 chip + 驳回原因 + 继续编辑入口 */
export default function ShowcaseMine() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const canPublish = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("showcase:publish");
  const [tab, setTab] = useState<"entries" | "stages">("entries");

  const myEntries = useQuery({ queryKey: ["showcase", "mine", "entries"], queryFn: showcaseApi.listMyEntries });
  const myStages = useQuery({
    queryKey: ["showcase", "mine", "stages"],
    queryFn: () => showcaseApi.listStages({ mine: true, pageSize: 50 }),
    enabled: tab === "stages",
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/showcase")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 先锋晒场
          </button>
          <span className="text-gray-200">|</span>
          <span className="font-bold text-gray-900">我的参晒 / 晒台</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("entries")}
            className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
              tab === "entries" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Megaphone className="h-4 w-4" />
            我的参晒({myEntries.data?.length ?? 0})
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => setTab("stages")}
              className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                tab === "stages" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Trophy className="h-4 w-4" />
              我的晒台
            </button>
          )}
        </div>

        {tab === "entries" ? (
          myEntries.isLoading ? (
            <div className="py-20 text-center text-sm text-gray-400">加载中…</div>
          ) : (myEntries.data?.length ?? 0) === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">
              还没参过晒 —— 去晒场找个擂台,晒出你的实绩
            </div>
          ) : (
            <div className="space-y-2.5">
              {(myEntries.data ?? []).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => navigate(`/showcase/entries/${e.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white/90 p-3 text-left shadow-sm hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium">{e.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ENTRY_STATUS_CHIP[e.status]}`}>
                        {ENTRY_STATUS_LABEL[e.status]}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      晒台:{e.stageTitle}
                      {e.stageStatus === "closed" && "(已收官)"}
                    </div>
                    {e.status === "rejected" && e.rejectReason && (
                      <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                        驳回:{e.rejectReason}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(e.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : myStages.isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">加载中…</div>
        ) : (myStages.data?.items.length ?? 0) === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">
            还没发起过晒台 —— 回晒场首页点「发起晒台」摆一个擂台
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(myStages.data?.items ?? []).map((s) => (
              <StageCard key={s.id} stage={s} showStatus onOpen={(id) => navigate(`/showcase/stages/${id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
