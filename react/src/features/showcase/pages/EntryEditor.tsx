import { useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Info, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/stores/auth";
import {
  showcaseApi,
  showcaseErrMsg,
  type EntryDetail,
  type ShowcaseBlock,
  type TemplateBlock,
} from "../api";
import { BlocksEditor } from "../components/BlocksEditor";
import { deriveCover, findBlockIssue, getTool } from "../tools/registry";
import { NumInput } from "../tools/widgets";

/**
 * 参晒报送(像多次报送:台主定填报规则,个人逐块照填):
 *   /showcase/entries/new?stageId=xx  新报送(取晒台拿 填报规则 + 比拼配置)
 *   /showcase/entries/:id/edit        修改报送(取作品,内含 stage 信息)
 * 标题自动=姓名(可改)、封面自动取报送内容里第一张图 —— 个人只管按规则填内容。
 * 旧晒台没配规则时兜底回自由创作(BlocksEditor)。
 */
export default function EntryEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const stageIdParam = searchParams.get("stageId") ?? "";

  const entry = useQuery({
    queryKey: ["showcase", "entry", id],
    queryFn: () => showcaseApi.getEntry(id!),
    enabled: !!id,
  });
  const stage = useQuery({
    queryKey: ["showcase", "stage", stageIdParam],
    queryFn: () => showcaseApi.getStage(stageIdParam),
    enabled: !id && !!stageIdParam,
  });

  if (id) {
    if (entry.isLoading) return <Shell><Center>加载中…</Center></Shell>;
    if (entry.isError || !entry.data)
      return <Shell><Center>{showcaseErrMsg(entry.error, "作品不存在或无权编辑")}</Center></Shell>;
    return <EntryForm key={id} entry={entry.data} stageInfo={entry.data.stage} />;
  }
  if (!stageIdParam) return <Shell><Center>缺少晒台参数,请从晒台页点「我要参晒」进入</Center></Shell>;
  if (stage.isLoading) return <Shell><Center>加载中…</Center></Shell>;
  if (stage.isError || !stage.data)
    return <Shell><Center>{showcaseErrMsg(stage.error, "晒台不存在")}</Center></Shell>;
  return (
    <EntryForm
      key={`new-${stageIdParam}`}
      stageInfo={{
        id: stage.data.id,
        title: stage.data.title,
        rankBy: stage.data.rankBy,
        metricLabel: stage.data.metricLabel,
        metricUnit: stage.data.metricUnit,
        template: stage.data.template,
      }}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 返回
          </button>
          <span className="text-gray-200">|</span>
          <span className="font-bold text-gray-900">参晒报送</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">{children}</div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="py-24 text-center text-sm text-gray-400">{children}</div>;
}

interface StageInfo {
  id: string;
  title: string;
  rankBy: "likes" | "metric";
  metricLabel: string | null;
  metricUnit: string | null;
  template: TemplateBlock[];
}

/** 按模板对齐已有内容:模板顺序重建,同 id 认领已填内容,缺的补默认(模板锁定后 id 恒稳) */
function alignToTemplate(existing: ShowcaseBlock[], template: TemplateBlock[]): ShowcaseBlock[] {
  return template.map((tb) => {
    const b = existing.find((x) => x.id === tb.id && x.type === tb.type);
    return {
      id: tb.id,
      type: tb.type,
      content: b?.content ?? (getTool(tb.type)?.makeDefault() ?? {}),
    };
  });
}

function EntryForm({ entry, stageInfo }: { entry?: EntryDetail; stageInfo: StageInfo }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();

  const template = stageInfo.template;
  const byTemplate = template.length > 0;

  const [entryId, setEntryId] = useState<string | null>(entry?.id ?? null);
  // 标题自动 = 姓名(可改);编辑时保留原标题
  const [title, setTitle] = useState(entry?.title ?? me?.name ?? "");
  const [metricValue, setMetricValue] = useState<number | undefined>(entry?.metricValue ?? undefined);
  const [blocks, setBlocks] = useState<ShowcaseBlock[]>(() =>
    byTemplate ? alignToTemplate(entry?.blocks ?? [], template) : entry?.blocks ?? [],
  );
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);

  const isMetric = stageInfo.rankBy === "metric";
  // 已公开作品被作者再编辑 → 后端会自动回待审(台主/管理员本人除外)
  const willDemote = entry?.status === "published" && entry.isAuthor && !entry.canReview;

  const payload = () => ({
    title: title.trim() || me?.name || "未命名报送",
    // 封面自动:取报送内容里第一张可当封面的图(编辑时无图则保留原封面)
    coverFileId: deriveCover(blocks) ?? entry?.coverFileId ?? undefined,
    blocks,
    metricValue,
  });

  const ensureId = async (): Promise<string> => {
    if (entryId) return entryId;
    if (savingRef.current) throw new Error("正在保存,请稍候再试");
    savingRef.current = true;
    try {
      const created = await showcaseApi.createEntry(stageInfo.id, payload());
      setEntryId(created.id);
      return created.id;
    } finally {
      savingRef.current = false;
    }
  };

  const upload = async (file: File) => {
    const eid = await ensureId();
    return showcaseApi.uploadEntryFile(eid, file);
  };

  const validateForm = (forSubmit: boolean): string | null => {
    if (!title.trim()) return "请填写报送名称(默认是你的姓名)";
    if (!forSubmit) return null;
    if (byTemplate) {
      for (let i = 0; i < template.length; i++) {
        const tb = template[i];
        const msg = getTool(tb.type)?.validate?.(blocks[i]?.content ?? {});
        if (msg) {
          setShowIssues(true);
          return `「${tb.title}」还没填好:${msg}`;
        }
      }
    } else {
      if (blocks.length === 0) return "还没有任何展示内容";
      const issue = findBlockIssue(blocks);
      if (issue) {
        setShowIssues(true);
        return issue.message;
      }
    }
    if (isMetric && (metricValue === undefined || !Number.isFinite(metricValue))) {
      return `请填写申报数值:${stageInfo.metricLabel ?? "比拼指标"}`;
    }
    return null;
  };

  const save = async (thenSubmit: boolean) => {
    const err = validateForm(thenSubmit);
    if (err) return toast.error(err);
    setBusy(true);
    try {
      // 建稿只走 ensureId 单一路径(savingRef 互斥)—— 防「上传正在建稿 + 点保存」并发建出两个草稿
      const eid = entryId ?? (await ensureId());
      if (entryId) await showcaseApi.updateEntry(eid, payload());
      if (thenSubmit) {
        const r = await showcaseApi.submitEntry(eid);
        toast.success(r.status === "published" ? "已直接公开(台主/管理员免审)" : "已报送,等待台主审核");
        qc.invalidateQueries({ queryKey: ["showcase"] });
        navigate(`/showcase/entries/${eid}`);
      } else {
        toast.success(willDemote ? "已保存,作品转入待审(重新审核后公开)" : "草稿已保存");
        qc.invalidateQueries({ queryKey: ["showcase"] });
      }
    } catch (e) {
      toast.error(showcaseErrMsg(e, e instanceof Error ? e.message : "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  const isDraftLike = !entry || ["draft", "rejected"].includes(entry.status);

  return (
    <Shell>
      <div className="mb-4 rounded-lg bg-party-soft px-4 py-2.5 text-sm text-gray-600">
        参晒晒台:<span className="font-medium text-[var(--party-primary)]">{stageInfo.title}</span>
        {byTemplate && <span className="ml-2 text-xs text-gray-500">按台主定的规则逐块报送即可</span>}
      </div>
      {entry?.status === "rejected" && entry.rejectReason && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          上次驳回原因:{entry.rejectReason}
        </div>
      )}
      {willDemote && (
        <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          <Info className="h-4 w-4 shrink-0" />
          作品已公开,保存修改后将转入待审、重新审核通过后再公开(防赛后改数据)
        </div>
      )}

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-gray-700">报送名称</span>
            <Input
              className="w-56"
              value={title}
              maxLength={100}
              placeholder="默认你的姓名,可改"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {isMetric && (
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-gray-700">
                申报「{stageInfo.metricLabel ?? "数值"}」*
              </span>
              <NumInput className="w-36" value={metricValue} placeholder="0" onChange={setMetricValue} />
              {stageInfo.metricUnit && <span className="text-sm text-gray-500">{stageInfo.metricUnit}</span>}
            </label>
          )}
        </div>

        {byTemplate ? (
          /* 按规则逐块报送(不能增删块) */
          <div className="space-y-3">
            {template.map((tb, i) => {
              const def = getTool(tb.type);
              if (!def) return null;
              const Icon = def.icon;
              const Editor = def.Editor;
              const issue = showIssues ? def.validate?.(blocks[i]?.content ?? {}) : null;
              return (
                <div
                  key={tb.id}
                  className={`rounded-xl border bg-white ${issue ? "border-red-300 ring-1 ring-red-200" : ""}`}
                >
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-party-soft text-xs font-bold text-[var(--party-primary)]">
                      {i + 1}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--party-primary)]" />
                    <span className="text-sm font-medium">{tb.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{def.label}</span>
                  </div>
                  {tb.requirement && (
                    <p className="border-b bg-amber-50/50 px-3 py-1.5 text-xs text-amber-700">
                      要求:{tb.requirement}
                    </p>
                  )}
                  <div className="p-3">
                    <Editor
                      value={blocks[i]?.content ?? {}}
                      upload={upload}
                      onChange={(content) =>
                        setBlocks((cur) => cur.map((b, j) => (j === i ? { ...b, content } : b)))
                      }
                    />
                    {issue && <p className="mt-2 text-xs text-red-600">{issue}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 旧晒台没配填报规则:自由创作兜底 */
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-gray-700">展示内容 *(最多 30 块)</div>
            <BlocksEditor value={blocks} onChange={setBlocks} upload={upload} max={30} showIssues={showIssues} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 mt-4 flex items-center gap-2 rounded-xl border border-gray-100 bg-white/95 p-3 shadow-lg backdrop-blur">
        <Button variant="outline" disabled={busy} onClick={() => void save(false)}>
          <Save className="mr-1 h-4 w-4" />
          {isDraftLike ? "保存草稿" : "保存修改"}
        </Button>
        {isDraftLike && (
          <Button
            className="bg-[var(--party-primary)] text-white hover:opacity-90"
            disabled={busy}
            onClick={() => void save(true)}
          >
            <Send className="mr-1 h-4 w-4" />
            提交报送
          </Button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {entryId ? "已建草稿,内容随保存更新" : "首次保存/上传时自动建草稿"}
        </span>
      </div>
    </Shell>
  );
}
