import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, ClipboardCheck, ClipboardList, Copy, FileText, Play, Plus, Trophy, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseIndicators,
  parseSettings,
  RELATION_LABELS,
  TRACK_LABELS,
  type AssessmentScheme,
  type AssessmentTrack,
  type IndicatorNode,
} from "../api";

const INPUT =
  "w-full px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

const STATUS_LABEL: Record<string, string> = { draft: "草稿", active: "启用", archived: "归档" };

function countLeaves(nodes: IndicatorNode[]): number {
  let n = 0;
  for (const x of nodes) {
    if (!x.children || x.children.length === 0) n += 1;
    else n += countLeaves(x.children);
  }
  return n;
}

export default function SchemeList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["assessment", "schemes"],
    queryFn: assessmentApi.listSchemes,
  });
  const schemes = useMemo(() => data ?? [], [data]);
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => assessmentApi.deleteScheme(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["assessment"] });
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "删除失败")),
  });

  const dup = useMutation({
    mutationFn: (id: string) => assessmentApi.duplicateScheme(id),
    onSuccess: (s) => {
      toast.success("已复制,改年度/完善指标即可");
      qc.invalidateQueries({ queryKey: ["assessment"] });
      navigate(`/admin/assessment/schemes/${s.id}`);
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "复制失败")),
  });

  const start = useMutation({
    mutationFn: (id: string) => assessmentApi.createRound(id, {}),
    onSuccess: (round) => {
      toast.success("已发起考核,去录入打分");
      qc.invalidateQueries({ queryKey: ["assessment", "rounds"] });
      navigate(`/admin/assessment/rounds/${round.id}`);
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "发起失败")),
  });

  // 「考核打分」:解析该表最新轮次 → 进打分页;没有轮次 → 提示先发起
  const goScore = async (schemeId: string) => {
    try {
      const rounds = await qc.fetchQuery({
        queryKey: ["assessment", "rounds", schemeId],
        queryFn: () => assessmentApi.listRounds(schemeId),
      });
      if (rounds[0]) navigate(`/admin/assessment/rounds/${rounds[0].id}`);
      else toast.info("这张考核表还没发起考核,点「发起考核」先开一轮");
    } catch (e) {
      toast.error(assessmentErrorMessage(e, "打开打分失败"));
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#172033] flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-[var(--party-primary)]" /> 考核表
          </h1>
          <p className="text-[13px] text-[#6B7280] mt-1">
            一张考核表 = 考核年度 + 考核内容(指标)+ 考核对象。党建 / 行政两路线通用;复用直接「复制」改年度。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-white text-sm font-medium"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          <Plus className="w-4 h-4" /> 新建考核表
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#9CA3AF]">加载中…</div>
      ) : schemes.length === 0 ? (
        <div className="py-16 text-center text-[#9CA3AF]">
          还没有考核表,点右上「新建考核表」开始。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {schemes.map((s) => (
            <SchemeCard
              key={s.id}
              scheme={s}
              onOpen={() => navigate(`/admin/assessment/schemes/${s.id}`)}
              onDuplicate={() => dup.mutate(s.id)}
              onDelete={() => del.mutate(s.id)}
              onStartRound={() => start.mutate(s.id)}
              onScore={() => goScore(s.id)}
              onRanking={() => navigate(`/admin/assessment/schemes/${s.id}/results?tab=ranking`)}
              onBoard={() => navigate(`/admin/assessment/schemes/${s.id}/results?tab=board`)}
            />
          ))}
        </div>
      )}

      <NewSchemeDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["assessment"] });
          navigate(`/admin/assessment/schemes/${id}`);
        }}
      />
    </div>
  );
}

function SchemeCard({
  scheme,
  onOpen,
  onDuplicate,
  onDelete,
  onStartRound,
  onScore,
  onRanking,
  onBoard,
}: {
  scheme: AssessmentScheme;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStartRound: () => void;
  onScore: () => void;
  onRanking: () => void;
  onBoard: () => void;
}) {
  const leaves = countLeaves(parseIndicators(scheme));
  const st = parseSettings(scheme);
  const subjectName = st.subjectName;
  const relationLabel = st.relationKey ? RELATION_LABELS[st.relationKey] : undefined;
  const targetCount = (() => {
    try {
      const v: unknown = JSON.parse(scheme.targetsJson);
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  })();
  return (
    <div
      onClick={onOpen}
      className="rounded-xl border border-[#eef2f7] bg-white p-4 cursor-pointer hover:border-[var(--party-primary)]/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[#172033] truncate">{scheme.name}</div>
          <div className="text-[12px] text-[#6B7280] mt-1">
            {scheme.year} 年 · {relationLabel ?? TRACK_LABELS[scheme.track]}
            {subjectName ? ` · ${subjectName}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1.5 rounded-md text-[#94a3b8] hover:text-[var(--party-primary)] hover:bg-party-soft"
            title="复制(改年度/完善指标即可复用)"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`删除考核表「${scheme.name}」?`)) onDelete();
            }}
            className="p-1.5 rounded-md text-[#94a3b8] hover:text-red-600 hover:bg-red-50"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-party-soft text-[var(--party-primary)]">{leaves} 个指标</span>
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#f1f5f9] text-[#475467]">{targetCount} 个对象</span>
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#f1f5f9] text-[#475467]">{STATUS_LABEL[scheme.status] ?? scheme.status}</span>
      </div>
      <div className="mt-3 pt-3 border-t border-[#f1f5f9] flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CardBtn icon={Play} label="发起考核" onClick={onStartRound} title="按本表发起一次考核,生成轮次去录入打分" />
        <CardBtn icon={ClipboardList} label="考核打分" onClick={onScore} title="进入本表最新轮次录入/确认打分" />
        <CardBtn icon={Trophy} label="考核排名" onClick={onRanking} title="按我负责的指标合计排名,支持下钻" />
        <CardBtn icon={BarChart3} label="各单位排名" onClick={onBoard} title="全量总分排名 + 邻近名次" />
        <span
          className="flex items-center gap-1 text-[12px] text-[#c4cbd6] cursor-not-allowed"
          title="单位考核报告(雷达图 + 问题建议)下一轮上线"
        >
          <FileText className="w-3.5 h-3.5" /> 单位报告
        </span>
      </div>
    </div>
  );
}

function CardBtn({
  icon: Icon,
  label,
  onClick,
  title,
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex items-center gap-1 text-[12px] font-medium text-[var(--party-primary)] hover:underline"
      title={title}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function NewSchemeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [track, setTrack] = useState<AssessmentTrack>("party");

  const create = useMutation({
    mutationFn: () => assessmentApi.createScheme({ name: name.trim(), year, track }),
    onSuccess: (s) => onCreated(s.id),
    onError: (e) => toast.error(assessmentErrorMessage(e, "创建失败")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>新建考核表</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <label className="block">
            <div className="text-[13px] font-medium text-[#374151] mb-1">考核表名称</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:2026年度党建责任制考核(单位)" className={INPUT} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-[13px] font-medium text-[#374151] mb-1">考核年份</div>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className={INPUT} />
            </label>
            <label className="block">
              <div className="text-[13px] font-medium text-[#374151] mb-1">路线</div>
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value as AssessmentTrack)}
                className={INPUT}
              >
                <option value="party">党建考核</option>
                <option value="admin">行政/业绩考核</option>
              </select>
            </label>
          </div>
          <div className="text-[12px] text-[#9CA3AF]">
            考核关系(谁考核谁)与考核对象在下一步「考核表设置」里按你的考核区域选择。
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-2 rounded-md text-sm text-[#475467] border border-[#dce4ef] hover:bg-[#f8fafc]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="px-3 py-2 rounded-md text-white text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {create.isPending ? "创建中…" : "创建并配置"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
