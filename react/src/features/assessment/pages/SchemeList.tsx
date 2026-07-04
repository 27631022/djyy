import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, ClipboardList, Copy, FileText, Home, Plus, Trophy, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useAuth } from "@/stores/auth";
import { siteSettingApi } from "@/features/site-setting";
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

  // 首页榜单控制:门户首页「考核排行榜」显示哪张表(存站点设置 portal.assessmentSchemeId,空=自动最新)。
  // 仅管理员可设(admin:menu,与后端 PUT /site-settings 同门)—— 建考核的人不能把首页榜单点来点去;
  // 「首页展示中」徽标所有人可见(知道当前首页展示的是哪张)。
  const { me } = useAuth();
  const canPinPortal = (me?.isPlatformAdmin || me?.permissions?.includes("admin:menu")) ?? false;
  const siteSettings = useQuery({ queryKey: ["site-settings"], queryFn: () => siteSettingApi.get(), staleTime: 60_000 });
  const pinnedSchemeId = siteSettings.data?.portal?.assessmentSchemeId || "";
  const pinPortal = useMutation({
    // 站点设置是整体替换式 PUT:取当前值只改 portal 节,避免覆盖别人刚改的品牌/主题
    mutationFn: async (schemeId: string) => {
      const cur = await siteSettingApi.get();
      return siteSettingApi.update({ ...cur, portal: { ...cur.portal, assessmentSchemeId: schemeId } });
    },
    onSuccess: (data) => {
      qc.setQueryData(["site-settings"], data);
      toast.success(
        data.portal.assessmentSchemeId ? "已设为首页榜单,门户首页将显示该考核的排名" : "已取消指定,首页恢复自动显示最新考核",
      );
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "设置失败(需登录管理员账号)")),
  });

  // 「考核打分」(年度考核 = 一张表一轮):进该表的轮次,没有就建一次、有就直接进 —— 不再每次开新轮
  const goScore = async (schemeId: string) => {
    try {
      const rounds = await qc.fetchQuery({
        queryKey: ["assessment", "rounds", schemeId],
        queryFn: () => assessmentApi.listRounds(schemeId),
      });
      const round = rounds[0] ?? (await assessmentApi.createRound(schemeId, {}));
      if (!rounds[0]) qc.invalidateQueries({ queryKey: ["assessment", "rounds"] });
      navigate(`/admin/assessment/rounds/${round.id}`);
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
              onScore={() => goScore(s.id)}
              onRanking={() => navigate(`/admin/assessment/schemes/${s.id}/results`)}
              onCheckup={() => navigate(`/admin/assessment/schemes/${s.id}/checkup`)}
              pinnedOnPortal={pinnedSchemeId === s.id}
              onTogglePortal={canPinPortal ? () => pinPortal.mutate(pinnedSchemeId === s.id ? "" : s.id) : undefined}
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
  onScore,
  onRanking,
  onCheckup,
  pinnedOnPortal,
  onTogglePortal,
}: {
  scheme: AssessmentScheme;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onScore: () => void;
  onRanking: () => void;
  onCheckup: () => void;
  /** 门户首页「考核排行榜」当前显示的就是这张表 */
  pinnedOnPortal: boolean;
  /** 设/取消首页榜单;undefined = 无权限(按钮不显示,徽标照常) */
  onTogglePortal?: () => void;
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
              if (
                confirm(
                  `删除考核表「${scheme.name}」?\n\n会同时删除该表的考核打分轮次、已录入的手动打分、生成的排名/定级与季度结果快照,且不可恢复。`,
                )
              )
                onDelete();
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
        {pinnedOnPortal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200">
            <Home className="w-3 h-3" /> 首页展示中
          </span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-[#f1f5f9] flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CardBtn icon={ClipboardList} label="考核打分" onClick={onScore} title="进入年度考核打分(没有则自动开始;一张表只一轮)" />
        <CardBtn icon={Trophy} label="考核排名" onClick={onRanking} title="各单位总分排名 + 我负责指标合计排名,支持下钻" />
        <CardBtn icon={FileText} label="单位体检" onClick={onCheckup} title="单位体检单:雷达图画像 + 逐项得分/名次 + 短板诊断(单位账号自动看自己单位)" />
        {onTogglePortal && (
          <CardBtn
            icon={Home}
            label={pinnedOnPortal ? "取消首页展示" : "设为首页榜单"}
            onClick={onTogglePortal}
            title={
              pinnedOnPortal
                ? "取消后,门户首页恢复自动显示最新考核的排名"
                : "让门户首页「考核排行榜」显示这张考核表的排名(全站只指定一张;仅管理员可设)"
            }
          />
        )}
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
  icon: typeof ClipboardList;
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
