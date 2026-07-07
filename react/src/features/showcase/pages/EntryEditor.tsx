import { useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Info, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  showcaseApi,
  showcaseErrMsg,
  type EntryDetail,
  type ShowcaseBlock,
} from "../api";
import { BlocksEditor } from "../components/BlocksEditor";
import { findBlockIssue } from "../tools/registry";
import { ImagePick, NumInput } from "../tools/widgets";

/**
 * 参晒作品编辑器:
 *   /showcase/entries/new?stageId=xx  新作品(先取晒台拿比拼配置)
 *   /showcase/entries/:id/edit        编辑(取作品,内含 stage 信息)
 * 外壳取数 + key 重挂载内层表单(useState 初始化器,零同步 effect)。
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
          <span className="font-bold text-gray-900">参晒作品</span>
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
}

function EntryForm({ entry, stageInfo }: { entry?: EntryDetail; stageInfo: StageInfo }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [entryId, setEntryId] = useState<string | null>(entry?.id ?? null);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [summary, setSummary] = useState(entry?.summary ?? "");
  const [coverFileId, setCoverFileId] = useState<string | undefined>(entry?.coverFileId ?? undefined);
  const [metricValue, setMetricValue] = useState<number | undefined>(entry?.metricValue ?? undefined);
  const [blocks, setBlocks] = useState<ShowcaseBlock[]>(entry?.blocks ?? []);
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);

  const isMetric = stageInfo.rankBy === "metric";
  // 已公开作品被作者再编辑 → 后端会自动回待审(台主/管理员本人除外)
  const willDemote = entry?.status === "published" && entry.isAuthor && !entry.canReview;

  const payload = () => ({
    title: title.trim() || "未命名作品",
    summary: summary.trim() || undefined,
    coverFileId,
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
    if (!title.trim()) return "请填写作品标题";
    if (forSubmit) {
      if (blocks.length === 0) return "还没有任何展示内容,先添加至少一个展示区块";
      const issue = findBlockIssue(blocks);
      if (issue) {
        setShowIssues(true);
        return issue.message;
      }
      if (isMetric && (metricValue === undefined || !Number.isFinite(metricValue))) {
        return `请填写申报数值:${stageInfo.metricLabel ?? "比拼指标"}`;
      }
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
        toast.success(r.status === "published" ? "已直接公开(台主/管理员免审)" : "已提交,等待台主审核");
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
        {isMetric && (
          <span className="ml-2 text-xs text-gray-500">
            (比拼「{stageInfo.metricLabel ?? "数值"}」,提交时需申报)
          </span>
        )}
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
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-gray-700">作品标题 *</div>
          <Input
            value={title}
            maxLength={100}
            placeholder="如「三车队 · 安全行驶 128 万公里」"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-gray-700">一句话说明</div>
            <Input
              value={summary}
              maxLength={300}
              placeholder="一句话亮点(显示在作品卡片上,选填)"
              onChange={(e) => setSummary(e.target.value)}
            />
            {isMetric && (
              <div className="flex items-center gap-2 pt-2">
                <span className="text-sm font-medium text-gray-700">
                  申报「{stageInfo.metricLabel ?? "数值"}」*
                </span>
                <NumInput className="w-36" value={metricValue} placeholder="0" onChange={setMetricValue} />
                {stageInfo.metricUnit && <span className="text-sm text-gray-500">{stageInfo.metricUnit}</span>}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-gray-700">封面图</div>
            <ImagePick className="h-24 w-36" fileId={coverFileId} upload={upload} removable onPick={setCoverFileId} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm font-medium text-gray-700">展示内容 *(最多 30 块)</div>
          <p className="text-xs text-muted-foreground">
            用展示工具晒实绩:前后对比、局部图、360°全景、视频、指标卡、趋势图、时间轴、图文故事、排行榜
          </p>
          <BlocksEditor value={blocks} onChange={setBlocks} upload={upload} max={30} showIssues={showIssues} />
        </div>
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
            保存并提交参晒
          </Button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {entryId ? "已建草稿,内容随保存更新" : "首次保存/上传时自动建草稿"}
        </span>
      </div>
    </Shell>
  );
}
