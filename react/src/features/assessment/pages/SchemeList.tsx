import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, Copy, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseIndicators,
  TARGET_LEVELS_BY_TRACK,
  TARGET_LEVEL_LABELS,
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
}: {
  scheme: AssessmentScheme;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const leaves = countLeaves(parseIndicators(scheme));
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
            {scheme.year} 年 · {TRACK_LABELS[scheme.track]} · {TARGET_LEVEL_LABELS[scheme.targetLevel] ?? scheme.targetLevel}
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
    </div>
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
  const [targetLevel, setTargetLevel] = useState("committee");

  const create = useMutation({
    mutationFn: () => assessmentApi.createScheme({ name: name.trim(), year, track, targetLevel }),
    onSuccess: (s) => onCreated(s.id),
    onError: (e) => toast.error(assessmentErrorMessage(e, "创建失败")),
  });

  const levels = TARGET_LEVELS_BY_TRACK[track];

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
                onChange={(e) => {
                  const t = e.target.value as AssessmentTrack;
                  setTrack(t);
                  setTargetLevel(TARGET_LEVELS_BY_TRACK[t][0].value);
                }}
                className={INPUT}
              >
                <option value="party">党建考核</option>
                <option value="admin">行政/业绩考核</option>
              </select>
            </label>
          </div>
          <label className="block">
            <div className="text-[13px] font-medium text-[#374151] mb-1">考核对象层级</div>
            <select value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} className={INPUT}>
              {levels.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
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
