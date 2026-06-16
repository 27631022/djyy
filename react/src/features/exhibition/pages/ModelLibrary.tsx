import { createElement, useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BoxIcon,
  CheckIcon,
  EyeIcon,
  Loader2Icon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
  Wand2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import "@google/model-viewer";
import { storageApi } from "@/features/storage";
import { modelLibraryApi, type LibraryModel, type OptimizePreset } from "../api";

/* ── 档位:大/中/小 ──
   优化产物按文件名后缀(-中/-小)定档;原始上传文件按体积定档(源=「原大小」)。
   大模型上传后自动生成 中+小;中/小 模型只打标签不自动生成。 */
type Tier = "大" | "中" | "小";
const TIER_ORDER: Tier[] = ["大", "中", "小"];
const BIG_BYTES = 30 * 1024 * 1024; // ≥30MB → 大(上传时自动生成 中/小)
const MID_BYTES = 6 * 1024 * 1024; // ≥6MB → 中;更小 → 小

/** 优化档名 → preset key */
const TIER_PRESET: Record<"中" | "小", OptimizePreset> = { 中: "medium", 小: "small" };

const TIER_BADGE: Record<Tier, string> = {
  大: "bg-rose-50 text-rose-600 border-rose-200",
  中: "bg-amber-50 text-amber-600 border-amber-200",
  小: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

/** 文件名后缀定档(-中/-小);无后缀返回 null(= 原始文件,按体积定档) */
function variantTier(name: string): "中" | "小" | null {
  if (/-小\.(glb|gltf)$/i.test(name)) return "小";
  if (/-中\.(glb|gltf)$/i.test(name)) return "中";
  return null;
}
function sizeTier(size: number): Tier {
  return size >= BIG_BYTES ? "大" : size >= MID_BYTES ? "中" : "小";
}
function tierOf(m: LibraryModel): Tier {
  return variantTier(m.name) ?? sizeTier(m.size);
}
/** 归组键:去掉 -中/-小 后缀与扩展名(同一模型的几个版本归一组) */
function baseNameOf(name: string): string {
  return name.replace(/-(中|小)\.(glb|gltf)$/i, "").replace(/\.(glb|gltf)$/i, "");
}

interface ModelGroup {
  key: string;
  base: string;
  source: "upload" | "ai";
  createdAt: string | Date;
  /** 各档位对应的文件(可能只有其中一档) */
  tiers: Partial<Record<Tier, LibraryModel>>;
  /** 代表文件:无后缀的原始文件;没有则取任一档 */
  rep: LibraryModel;
  tags: string[];
}

function groupModels(models: LibraryModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const m of models) {
    // 仅按基名归组(去 -中/-小 后缀),忽略来源:AI 生成模型的优化版会落在 upload 夹,
    // 来源不同但仍是同一个模型,必须归到同一张卡 —— 否则点「小」生成的版本会另起一张卡。
    const base = baseNameOf(m.name);
    let g = map.get(base);
    if (!g) {
      g = { key: base, base, source: m.source, createdAt: m.createdAt, tiers: {}, rep: m, tags: m.tags };
      map.set(base, g);
    }
    g.tiers[tierOf(m)] = m;
    // 代表文件 = 无后缀原始件(决定卡片名/标签/缩略图/创建时间)
    if (!variantTier(m.name)) {
      g.rep = m;
      g.tags = m.tags;
      g.createdAt = m.createdAt;
    }
  }
  return [...map.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

/** model-viewer 是 web component;createElement 渲染避开 JSX 自定义元素类型声明(照 Model3dStudio) */
function ModelViewer({ src }: { src: string }) {
  return createElement("model-viewer", {
    src,
    "camera-controls": true,
    "auto-rotate": true,
    "shadow-intensity": "1",
    exposure: "1",
    style: { width: "100%", height: "100%", background: "#f4f4f2" },
  });
}

/** model-viewer 的 toBlob 等截图 API(官方有,类型声明里没有) */
interface ModelViewerEl extends HTMLElement {
  toBlob(opts?: { mimeType?: string; qualityArgument?: number; idealAspect?: boolean }): Promise<Blob>;
}

/**
 * 缺预览图的模型:后台用隐形 model-viewer 渲染一帧 → 截图上传为「<模型名>.thumb.png」
 * (与模型同夹,列表按名字配对)。一次只截一个,失败进跳过集合不死循环。
 */
function ThumbCapture({
  m,
  onDone,
  onFail,
}: {
  m: LibraryModel;
  onDone: () => void;
  onFail: (id: string) => void;
}) {
  const attach = useCallback(
    (mv: ModelViewerEl | null) => {
      if (!mv) return;
      let alive = true;
      const capture = async () => {
        try {
          await new Promise((r) => setTimeout(r, 1200));
          if (!alive) return;
          const blob = await mv.toBlob({ mimeType: "image/png", idealAspect: false });
          if (!alive) return;
          if (!blob || blob.size < 8000) throw new Error("captured blank frame");
          const file = new File([blob], `${m.name}.thumb.png`, { type: "image/png" });
          await storageApi.upload(
            file,
            m.source === "ai"
              ? { ownerModule: "model3d", folder: "models" }
              : { ownerModule: "exhibition", folder: "model-library" },
          );
          if (alive) onDone();
        } catch {
          if (alive) onFail(m.id);
        }
      };
      mv.addEventListener("load", capture, { once: true });
      const timeout = setTimeout(() => {
        if (alive) onFail(m.id);
      }, 90_000);
      return () => {
        alive = false;
        clearTimeout(timeout);
        mv.removeEventListener("load", capture);
      };
    },
    [m.id, m.name, m.source, onDone, onFail],
  );
  return createElement("model-viewer", {
    ref: attach,
    src: m.url,
    "camera-orbit": "-30deg 72deg 105%",
    "field-of-view": "30deg",
    "interaction-prompt": "none",
    style: {
      position: "fixed",
      left: 0,
      top: 0,
      width: "480px",
      height: "360px",
      opacity: 0.01,
      pointerEvents: "none",
      zIndex: -1,
    },
  });
}

function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
function fmtWan(n: number): string {
  return n >= 1e4 ? `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)}万` : `${n}`;
}

/**
 * 一个模型组一张卡:底部「大/中/小」档位标签(各带尺寸)切换;缺的档位可一键生成。
 * 卡片名/标签/缩略图取代表文件(原始件)。删除针对当前选中档位。
 */
function ModelGroupCard({
  g,
  capturing,
  onChanged,
  onDelete,
}: {
  g: ModelGroup;
  capturing: boolean;
  onChanged: () => void;
  onDelete: (m: LibraryModel) => void;
}) {
  const availableTiers = TIER_ORDER.filter((t) => g.tiers[t]);
  const [activeTier, setActiveTier] = useState<Tier>(tierOf(g.rep));
  const active = g.tiers[activeTier] ?? g.rep;
  const [show3d, setShow3d] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  // 改名:同步改组内所有档位(保留 -中/-小 后缀),否则会拆组
  const renameMut = useMutation({
    mutationFn: async (newBase: string) => {
      for (const t of availableTiers) {
        const f = g.tiers[t];
        if (!f) continue;
        const suffix = variantTier(f.name); // 中/小 或 null(原始)
        await modelLibraryApi.update(f.id, { name: suffix ? `${newBase}-${suffix}` : newBase });
      }
    },
    onSuccess: () => {
      onChanged();
      setEditingName(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "改名失败"),
  });

  const tagMut = useMutation({
    mutationFn: (tags: string[]) => modelLibraryApi.update(g.rep.id, { tags }),
    onSuccess: () => {
      onChanged();
      setAddingTag(false);
      setTagDraft("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  // 生成缺失档位(中/小);源用代表文件(原始/最大件)
  const optimizeMut = useMutation({
    mutationFn: async (tier: "中" | "小") => modelLibraryApi.optimize(g.rep.id, TIER_PRESET[tier]),
    onSuccess: (r, tier) => {
      onChanged();
      setActiveTier(tier);
      toast.success(
        `已生成「${tier}」:${fmtWan(r.beforeVertices)}→${fmtWan(r.afterVertices)}面 · ${fmtSize(r.beforeSize)}→${fmtSize(r.afterSize)}`,
        { duration: 6000 },
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "生成失败"),
  });

  const submitName = () => {
    const v = nameDraft.trim();
    if (!v || v === g.base) {
      setEditingName(false);
      return;
    }
    renameMut.mutate(v);
  };
  const addTag = () => {
    const v = tagDraft.trim();
    if (!v) {
      setAddingTag(false);
      return;
    }
    if (g.tags.includes(v)) {
      setTagDraft("");
      return;
    }
    tagMut.mutate([...g.tags, v]);
  };

  // 有原始/大件时才提供「+生成」补缺(中/小);小件不再派生
  const hasBase = !!g.tiers["大"] || !!g.tiers["中"];

  return (
    <div className="border border-[#ECECEC] rounded-xl bg-white overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[#F7F7F5] relative">
        {show3d ? (
          <ModelViewer src={active.url} />
        ) : (
          <button type="button" onClick={() => setShow3d(true)} className="absolute inset-0 group" title="点击加载 3D 预览">
            {g.rep.thumbUrl ? (
              <img src={g.rep.thumbUrl} alt={g.base} className="w-full h-full object-contain" />
            ) : capturing ? (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[#C9C9C5]">
                <Loader2Icon className="w-7 h-7 animate-spin" />
                <span className="text-[11px]">生成预览图…</span>
              </span>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-[#C9C9C5]">
                <PackageIcon className="w-12 h-12" />
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors">
              <span className="hidden group-hover:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/90 text-xs text-[#1A1A1A]">
                <EyeIcon className="w-3.5 h-3.5" />
                3D 预览
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        {editingName ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border border-[var(--party-primary)] rounded focus:outline-none"
            />
            <button type="button" className="p-1 text-emerald-600" onClick={submitName} title="保存">
              {renameMut.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 min-w-0 group/name">
            <span className="text-sm font-medium text-[#1A1A1A] truncate" title={g.base}>
              {g.base}
            </span>
            <button
              type="button"
              className="p-0.5 text-[#C9C9C5] hover:text-[var(--party-primary)] opacity-0 group-hover/name:opacity-100 flex-shrink-0"
              title="改名(同步改大/中/小)"
              onClick={() => {
                setNameDraft(g.base);
                setEditingName(true);
              }}
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
              g.source === "ai" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {g.source === "ai" ? <SparklesIcon className="w-3 h-3" /> : <UploadIcon className="w-3 h-3" />}
            {g.source === "ai" ? "AI 生成" : "上传"}
          </span>
          <span>{new Date(g.createdAt).toLocaleDateString()}</span>
        </div>

        {/* 档位标签:大/中/小(各带尺寸),点选切换;缺的档位显示「+生成」 */}
        <div className="flex items-center gap-1 flex-wrap">
          {TIER_ORDER.map((t) => {
            const f = g.tiers[t];
            if (f) {
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setActiveTier(t);
                    setShow3d(false);
                  }}
                  title={`${t} 版 · ${fmtSize(f.size)}`}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded border ${
                    activeTier === t ? TIER_BADGE[t] : "border-[#E5E5E5] text-[#9CA3AF]"
                  }`}
                >
                  <span className="font-medium">{t}</span>
                  <span className="opacity-80">{fmtSize(f.size)}</span>
                </button>
              );
            }
            // 缺失的 中/小:有原件时提供「+生成」
            if ((t === "中" || t === "小") && hasBase) {
              return (
                <button
                  key={t}
                  type="button"
                  disabled={optimizeMut.isPending}
                  onClick={() => optimizeMut.mutate(t)}
                  title={`生成「${t}」优化版(${t === "中" ? "减面约一半" : "减面约 3/4"})`}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded border border-dashed border-[#D4D4D4] text-[#9CA3AF] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
                >
                  {optimizeMut.isPending && optimizeMut.variables === t ? (
                    <Loader2Icon className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2Icon className="w-3 h-3" />
                  )}
                  {t}
                </button>
              );
            }
            return null;
          })}
        </div>

        {/* 标签 */}
        <div className="flex items-center gap-1 flex-wrap">
          {g.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded bg-[#F5F5F4] text-[#52525B]">
              {t}
              <button
                type="button"
                className="text-[#C9C9C5] hover:text-red-500"
                title="移除标签"
                onClick={() => tagMut.mutate(g.tags.filter((x) => x !== t))}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
          {addingTag ? (
            <input
              autoFocus
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag();
                if (e.key === "Escape") setAddingTag(false);
              }}
              onBlur={addTag}
              placeholder="标签名"
              className="w-20 px-1.5 py-0.5 text-[11px] border border-[var(--party-primary)] rounded focus:outline-none"
            />
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded border border-dashed border-[#D4D4D4] text-[#9CA3AF] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
              onClick={() => setAddingTag(true)}
            >
              <PlusIcon className="w-3 h-3" />
              标签
            </button>
          )}
        </div>

        {/* 底部:删除当前档位(缺的档位点上面 大/中/小 标签即可生成,不另设按钮) */}
        <div className="mt-auto pt-1.5 flex items-center justify-end">
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[#9CA3AF] hover:text-red-500 hover:bg-red-50"
            onClick={() => onDelete(active)}
            title={`删除当前「${activeTier}」版`}
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            删除{activeTier}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 模型库:统一管理可上展台的 3D 模型 —— 手动上传的 .glb/.gltf + 「3D 生成」的 AI 产物。
 * 同一模型的「大/中/小」版本归到一张卡片(底部档位标签切换、各带尺寸);上传大模型自动生成 中/小,
 * 中/小 模型只按尺寸打标签。左栏综合搜索(关键词 + 来源 + 标签),卡片点击加载 3D 预览。
 */
export default function ModelLibraryPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "ai" | "upload">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["exhibition", "model-library"],
    queryFn: () => modelLibraryApi.list(),
  });

  const models = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const groups = useMemo(() => groupModels(models), [models]);

  /* ── 自动补 3D 预览图:缺图的【代表文件】逐个用隐形 model-viewer 截一帧 ── */
  const [visibleOk] = useState(() => typeof document !== "undefined" && document.visibilityState === "visible");
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const captureTarget = visibleOk
    ? groups.map((g) => g.rep).find((m) => !m.thumbUrl && !failedIds.has(m.id)) ?? null
    : null;
  const onCaptureDone = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["exhibition", "model-library"] });
  }, [qc]);
  const onCaptureFail = useCallback((id: string) => {
    setFailedIds((s) => new Set(s).add(id));
  }, []);

  const removeMut = useMutation({
    mutationFn: (id: string) => storageApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exhibition", "model-library"] });
      toast.success("已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  /** 标签分类(计数,按出现次数降序) */
  const tagStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of groups) for (const t of g.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return groups.filter((g) => {
      if (sourceFilter !== "all" && g.source !== sourceFilter) return false;
      if (tagFilter && !g.tags.includes(tagFilter)) return false;
      if (kw && !g.base.toLowerCase().includes(kw) && !g.tags.some((t) => t.toLowerCase().includes(kw))) return false;
      return true;
    });
  }, [groups, keyword, sourceFilter, tagFilter]);

  async function onUpload(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        const meta = await storageApi.upload(f, { ownerModule: "exhibition", folder: "model-library" });
        // 大模型(≥30MB)上传后自动生成 中+小(在线优化,各几秒);中/小 模型不动,只按尺寸打标签
        if (meta && meta.size >= BIG_BYTES && /\.(glb|gltf)$/i.test(f.name)) {
          toast.info(`「${f.name}」较大(${fmtSize(meta.size)}),正在生成 中/小 优化版…`, { duration: 8000 });
          for (const preset of ["medium", "small"] as const) {
            try {
              await modelLibraryApi.optimize(meta.id, preset);
            } catch {
              toast.error(`「${f.name}」的${preset === "medium" ? "中" : "小"}版生成失败,可在卡片上手动补`);
            }
          }
        }
      }
      qc.invalidateQueries({ queryKey: ["exhibition", "model-library"] });
      toast.success(`已上传 ${list.length} 个模型`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ["exhibition", "model-library"] });

  const sideBtn = (active: boolean) =>
    `w-full text-left px-2.5 py-1.5 text-sm rounded-md ${
      active ? "bg-party-soft text-[var(--party-primary)] font-medium" : "text-[#52525B] hover:bg-[#F5F5F4]"
    }`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
            <BoxIcon className="w-5 h-5 text-[var(--party-primary)]" />
            模型库
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            集中管理可上展台的 3D 模型。同一模型的「大/中/小」版本归在一张卡片下(各带尺寸,点档位切换);
            上传大模型(≥30MB)会自动生成 中/小 优化版,布展时按设备选用 —— 集显电脑用小/中更流畅。
          </p>
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-white disabled:opacity-60 flex-shrink-0"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          {uploading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
          {uploading ? "上传/生成中…" : "上传模型"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf"
          multiple
          className="hidden"
          onChange={(e) => {
            void onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="grid grid-cols-[190px_1fr] gap-5 items-start">
        {/* 左:综合搜索分栏 */}
        <aside className="border border-[#ECECEC] rounded-xl bg-white p-3 space-y-3 sticky top-4">
          <div className="relative">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#C9C9C5]" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜名称 / 标签"
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border border-[#E5E5E5] focus:border-[var(--party-primary)] focus:outline-none"
            />
          </div>
          <div>
            <div className="text-[11px] text-[#9CA3AF] px-1 mb-1">来源</div>
            <div className="space-y-0.5">
              <button type="button" className={sideBtn(sourceFilter === "all")} onClick={() => setSourceFilter("all")}>
                全部({groups.length})
              </button>
              <button type="button" className={sideBtn(sourceFilter === "ai")} onClick={() => setSourceFilter("ai")}>
                AI 生成({groups.filter((g) => g.source === "ai").length})
              </button>
              <button type="button" className={sideBtn(sourceFilter === "upload")} onClick={() => setSourceFilter("upload")}>
                上传({groups.filter((g) => g.source === "upload").length})
              </button>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9CA3AF] px-1 mb-1 flex items-center gap-1">
              <TagIcon className="w-3 h-3" />
              标签分类
            </div>
            <div className="space-y-0.5">
              <button type="button" className={sideBtn(tagFilter === null)} onClick={() => setTagFilter(null)}>
                全部
              </button>
              {tagStats.length === 0 && <div className="px-2.5 py-1 text-[11px] text-[#C9C9C5]">还没有标签 —— 在卡片上「+标签」</div>}
              {tagStats.map(([t, n]) => (
                <button key={t} type="button" className={sideBtn(tagFilter === t)} onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                  {t}({n})
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 右:模型组卡片 */}
        <div>
          {listQuery.isLoading ? (
            <div className="text-sm text-[#9CA3AF] py-20 text-center">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-[#D4D4D4] rounded-xl py-20 text-center text-sm text-[#9CA3AF]">
              {groups.length === 0
                ? "还没有模型 —— 点右上「上传模型」,或到「3D 生成」用一张图片生成"
                : "没有匹配的模型,换个关键词或清掉筛选试试"}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((g) => (
                <ModelGroupCard
                  key={g.key}
                  g={g}
                  capturing={captureTarget?.id === g.rep.id}
                  onChanged={invalidate}
                  onDelete={(m) => {
                    if (window.confirm(`删除模型「${m.name}」?\n若有展台正在使用该版本,3D 里将显示占位物。`)) {
                      removeMut.mutate(m.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 隐形截图器:一次截一个缺图模型 */}
      {captureTarget && <ThumbCapture key={captureTarget.id} m={captureTarget} onDone={onCaptureDone} onFail={onCaptureFail} />}
    </div>
  );
}
