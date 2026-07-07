import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Info, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { useAuth } from "@/stores/auth";
import {
  showcaseApi,
  showcaseErrMsg,
  type RankBy,
  type SaveStageInput,
  type ShowcaseBlock,
  type StageDetail,
  type TemplateBlock,
} from "../api";
import { BlocksEditor } from "../components/BlocksEditor";
import { TemplateDesigner } from "../components/TemplateDesigner";
import { findBlockIssue } from "../tools/registry";
import { ImagePick } from "../tools/widgets";

/** 发起/编辑晒台。外壳取数(编辑时),`key={id}` 重挂载内层表单(useState 初始化器读入,零同步 effect)。 */
export default function StageEditor() {
  const { id } = useParams();
  const stage = useQuery({
    queryKey: ["showcase", "stage", id],
    queryFn: () => showcaseApi.getStage(id!),
    enabled: !!id,
  });

  if (id && stage.isLoading)
    return <EditorShell title="编辑晒台"><div className="py-24 text-center text-sm text-gray-400">加载中…</div></EditorShell>;
  if (id && (stage.isError || !stage.data))
    return (
      <EditorShell title="编辑晒台">
        <div className="py-24 text-center text-sm text-gray-400">
          {showcaseErrMsg(stage.error, "晒台不存在或无权编辑")}
        </div>
      </EditorShell>
    );
  return <StageForm key={id ?? "new"} stage={id ? stage.data : undefined} />;
}

function EditorShell({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/showcase")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 先锋晒场
          </button>
          <span className="text-gray-200">|</span>
          <span className="font-bold text-gray-900">{title}</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">{children}</div>
    </div>
  );
}

const FIELD = "space-y-1.5";
const LABEL = "text-sm font-medium text-gray-700";

function StageForm({ stage }: { stage?: StageDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const isManager = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("showcase:manage");

  const categories = useQuery({ queryKey: ["showcase", "categories"], queryFn: showcaseApi.listCategories });

  // 编辑态全 useState 初始化器起步(key 重挂载保证切换晒台时重置)
  const [stageId, setStageId] = useState<string | null>(stage?.id ?? null);
  const [title, setTitle] = useState(stage?.title ?? "");
  const [categoryId, setCategoryId] = useState(stage?.categoryId ?? "");
  const [intro, setIntro] = useState(stage?.intro ?? "");
  const [rulesMd, setRulesMd] = useState(stage?.rulesMd ?? "");
  const [coverFileId, setCoverFileId] = useState<string | undefined>(stage?.coverFileId ?? undefined);
  const [rankBy, setRankBy] = useState<RankBy>(stage?.rankBy ?? "likes");
  const [metricLabel, setMetricLabel] = useState(stage?.metricLabel ?? "");
  const [metricUnit, setMetricUnit] = useState(stage?.metricUnit ?? "");
  const [metricDecimals, setMetricDecimals] = useState(stage?.metricDecimals ?? 0);
  const [metricOrder, setMetricOrder] = useState<"desc" | "asc">(stage?.metricOrder ?? "desc");
  const [introBlocks, setIntroBlocks] = useState<ShowcaseBlock[]>(stage?.introBlocks ?? []);
  const [template, setTemplate] = useState<TemplateBlock[]>(stage?.template ?? []);
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);

  // 已有参晒作品 → 排位配置只读(后端也拦)
  const rankLocked = (stage?.entryCount ?? 0) > 0;
  // 填报规则同理;例外:原规则为空(旧数据)时允许补设一次
  const templateLocked = rankLocked && (stage?.template.length ?? 0) > 0;
  const savingRef = useRef(false);

  const payload = (): SaveStageInput => ({
    title: title.trim() || "未命名晒台",
    categoryId,
    intro: intro.trim() || undefined,
    rulesMd: rulesMd.trim() || undefined,
    coverFileId,
    introBlocks,
    ...(templateLocked ? {} : { template }),
    ...(rankLocked
      ? {}
      : {
          rankBy,
          metricLabel: rankBy === "metric" ? metricLabel.trim() || undefined : undefined,
          metricUnit: rankBy === "metric" ? metricUnit.trim() || undefined : undefined,
          metricDecimals: rankBy === "metric" ? metricDecimals : undefined,
          metricOrder: rankBy === "metric" ? metricOrder : undefined,
        }),
  });

  /** 上传前确保草稿已建(文件夹要挂 stage-<id>);并发时靠 savingRef 防重复建 */
  const ensureId = async (): Promise<string> => {
    if (stageId) return stageId;
    if (!categoryId) throw new Error("请先选择晒场分类");
    if (savingRef.current) throw new Error("正在保存,请稍候再试");
    savingRef.current = true;
    try {
      const created = await showcaseApi.createStage(payload());
      setStageId(created.id);
      return created.id;
    } finally {
      savingRef.current = false;
    }
  };

  const upload = async (file: File) => {
    const sid = await ensureId();
    return showcaseApi.uploadStageFile(sid, file);
  };

  const validateForm = (forSubmit: boolean): string | null => {
    if (!title.trim()) return "请填写晒台标题";
    if (!categoryId) return "请选择晒场分类";
    if (rankBy === "metric" && !metricLabel.trim()) return "按数值比拼需要填写比拼指标名称(如「安全行驶里程」)";
    if (template.some((b) => !b.title.trim())) return "填报规则里有块没写块标题";
    if (forSubmit && template.length === 0) {
      return "还没设置填报规则:在「填报规则」里定好参晒人要报送的内容块";
    }
    const issue = findBlockIssue(introBlocks);
    if (issue) {
      setShowIssues(true);
      return `台头介绍${issue.message}`;
    }
    return null;
  };

  const save = async (thenSubmit: boolean) => {
    const err = validateForm(thenSubmit);
    if (err) return toast.error(err);
    setBusy(true);
    try {
      // 建稿只走 ensureId 单一路径(savingRef 互斥)—— 防「上传正在建稿 + 点保存」并发建出两个草稿
      const sid = stageId ?? (await ensureId());
      if (stageId) await showcaseApi.updateStage(sid, payload());
      if (thenSubmit) {
        const r = await showcaseApi.submitStage(sid);
        toast.success(r.status === "published" ? "已直接上架(管理员免审)" : "已提交,等待管理员审核上架");
        qc.invalidateQueries({ queryKey: ["showcase"] });
        navigate(`/showcase/stages/${sid}`);
      } else {
        toast.success("草稿已保存");
        qc.invalidateQueries({ queryKey: ["showcase"] });
      }
    } catch (e) {
      toast.error(showcaseErrMsg(e, e instanceof Error ? e.message : "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  // 新建 / 草稿 / 驳回 → 可提交审核;其余状态(已上架/待审/已收官)只能保存修改
  const isDraftLike = !stage || ["draft", "rejected"].includes(stage.status);

  return (
    <EditorShell title={stage ? "编辑晒台" : "发起晒台"}>
      {stage?.status === "rejected" && stage.rejectReason && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          上次驳回原因:{stage.rejectReason}
        </div>
      )}

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
        <div className={FIELD}>
          <div className={LABEL}>晒台标题 *</div>
          <Input
            value={title}
            maxLength={100}
            placeholder="如「晒安全行驶里程」「晒经营业绩」"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={FIELD}>
            <div className={LABEL}>晒场分类 *</div>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">选择先锋榜…</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={FIELD}>
            <div className={LABEL}>封面图</div>
            <ImagePick className="h-24" fileId={coverFileId} upload={upload} removable onPick={setCoverFileId} />
          </div>
        </div>

        <div className={FIELD}>
          <div className={LABEL}>一段话简介</div>
          <Textarea
            value={intro}
            maxLength={300}
            className="min-h-16"
            placeholder="晒什么、怎么比,一段话说清(显示在晒台卡片上)"
            onChange={(e) => setIntro(e.target.value)}
          />
        </div>

        {/* 排位配置 */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <span className={LABEL}>排位方式</span>
            {rankLocked && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Info className="h-3.5 w-3.5" />
                已有参晒作品,排位配置不能再修改
              </span>
            )}
          </div>
          <div className="mt-2.5 flex gap-3">
            {(
              [
                { v: "likes", label: "按点赞排位", hint: "谁的作品获赞多谁靠前,人气比拼" },
                { v: "metric", label: "按数值比拼", hint: "参晒时申报数值(如里程/业绩),按数值排位" },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={`flex flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border p-3 ${
                  rankBy === o.v ? "border-[var(--party-primary)] bg-party-soft" : "border-gray-200"
                } ${rankLocked ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    checked={rankBy === o.v}
                    disabled={rankLocked}
                    onChange={() => setRankBy(o.v)}
                  />
                  {o.label}
                </span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </label>
            ))}
          </div>
          {rankBy === "metric" && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className={FIELD}>
                <div className="text-xs text-muted-foreground">比拼指标 *</div>
                <Input
                  value={metricLabel}
                  maxLength={30}
                  disabled={rankLocked}
                  placeholder="如「安全行驶里程」"
                  onChange={(e) => setMetricLabel(e.target.value)}
                />
              </div>
              <div className={FIELD}>
                <div className="text-xs text-muted-foreground">单位</div>
                <Input
                  value={metricUnit}
                  maxLength={12}
                  disabled={rankLocked}
                  placeholder="如「万公里」"
                  onChange={(e) => setMetricUnit(e.target.value)}
                />
              </div>
              <div className={FIELD}>
                <div className="text-xs text-muted-foreground">小数位</div>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={metricDecimals}
                  disabled={rankLocked}
                  onChange={(e) => setMetricDecimals(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((d) => (
                    <option key={d} value={d}>
                      {d} 位
                    </option>
                  ))}
                </select>
              </div>
              <div className={FIELD}>
                <div className="text-xs text-muted-foreground">名次方向</div>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={metricOrder}
                  disabled={rankLocked}
                  onChange={(e) => setMetricOrder(e.target.value as "desc" | "asc")}
                >
                  <option value="desc">数值大的靠前</option>
                  <option value="asc">数值小的靠前</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 填报规则:像多次报送一样,只由台主定规则,参晒人逐块照填 */}
        <div className="rounded-xl border border-[var(--party-primary)]/25 bg-party-soft/40 p-4">
          <div className="flex items-center gap-2">
            <span className={LABEL}>填报规则 *(参晒人按此报送)</span>
            {templateLocked && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Info className="h-3.5 w-3.5" />
                已有参晒作品,填报规则不能再修改
              </span>
            )}
          </div>
          <p className="mb-2.5 mt-1 text-xs text-muted-foreground">
            从展示工具里挑几块排好序、写清要求;参晒人进入晒台后逐块照填即可,不能增删块
          </p>
          <TemplateDesigner value={template} onChange={setTemplate} locked={templateLocked} />
        </div>

        <div className={FIELD}>
          <div className={LABEL}>比拼规则(选填,支持 markdown)</div>
          <Textarea
            value={rulesMd}
            maxLength={20000}
            className="min-h-24 font-mono text-sm"
            placeholder={"如:\n- 参晒范围:全体党员\n- 申报口径:2026 年 1-6 月安全行驶里程\n- 截止时间:7 月底收官"}
            onChange={(e) => setRulesMd(e.target.value)}
          />
        </div>

        <div className={FIELD}>
          <div className={LABEL}>台头介绍(选填,最多 10 块)</div>
          <p className="text-xs text-muted-foreground">
            用展示工具搭一段擂台介绍(如往届回顾视频、目标指标卡);参晒作品的内容由参与者各自提交
          </p>
          <BlocksEditor value={introBlocks} onChange={setIntroBlocks} upload={upload} max={10} showIssues={showIssues} />
        </div>
      </div>

      {/* 底部操作 */}
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
            {isManager ? "保存并上架(管理员免审)" : "保存并提交审核"}
          </Button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {stageId ? "已建草稿,内容随保存更新" : "首次保存/上传时自动建草稿"}
        </span>
      </div>
    </EditorShell>
  );
}
