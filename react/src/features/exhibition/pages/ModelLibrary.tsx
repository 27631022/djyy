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
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import "@google/model-viewer";
import { storageApi } from "@/features/storage";
import { modelLibraryApi, type LibraryModel } from "../api";

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
  // callback ref(React 19 支持返回 cleanup):挂载即布置截图,避开 createElement
  // 手写 props 里传 ref 对象被 React Compiler 判「render 期读 ref」
  const attach = useCallback(
    (mv: ModelViewerEl | null) => {
      if (!mv) return;
      let alive = true;
      const capture = async () => {
        try {
          // 等首帧稳定(自动相机定位/IBL 就绪)
          await new Promise((r) => setTimeout(r, 1200));
          if (!alive) return;
          const blob = await mv.toBlob({ mimeType: "image/png", idealAspect: false });
          if (!alive) return;
          // 空帧守卫:纯透明/纯色 png 只有几 KB,不上传(避免污染成黑图)
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

/** 单卡:缩略图默认(自动截的 3D 渲染图),点击才挂 model-viewer;就地改名;标签编辑 */
function ModelCard({
  m,
  capturing,
  onChanged,
  onDelete,
}: {
  m: LibraryModel;
  capturing: boolean;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const [show3d, setShow3d] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const updateMut = useMutation({
    mutationFn: (body: { name?: string; tags?: string[] }) => modelLibraryApi.update(m.id, body),
    onSuccess: () => {
      onChanged();
      setEditingName(false);
      setAddingTag(false);
      setTagDraft("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const baseName = m.name.replace(/\.(glb|gltf)$/i, "");

  const submitName = () => {
    const v = nameDraft.trim();
    if (!v || v === baseName) {
      setEditingName(false);
      return;
    }
    updateMut.mutate({ name: v });
  };
  const addTag = () => {
    const v = tagDraft.trim();
    if (!v) {
      setAddingTag(false);
      return;
    }
    if (m.tags.includes(v)) {
      setTagDraft("");
      return;
    }
    updateMut.mutate({ tags: [...m.tags, v] });
  };

  return (
    <div className="border border-[#ECECEC] rounded-xl bg-white overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[#F7F7F5] relative">
        {show3d ? (
          <ModelViewer src={m.url} />
        ) : (
          <button
            type="button"
            onClick={() => setShow3d(true)}
            className="absolute inset-0 group"
            title="点击加载 3D 预览"
          >
            {m.thumbUrl ? (
              <img src={m.thumbUrl} alt={m.name} className="w-full h-full object-contain" />
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
              {updateMut.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 min-w-0 group/name">
            <span className="text-sm font-medium text-[#1A1A1A] truncate" title={m.name}>
              {baseName}
            </span>
            <button
              type="button"
              className="p-0.5 text-[#C9C9C5] hover:text-[var(--party-primary)] opacity-0 group-hover/name:opacity-100 flex-shrink-0"
              title="改名"
              onClick={() => {
                setNameDraft(baseName);
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
              m.source === "ai" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {m.source === "ai" ? <SparklesIcon className="w-3 h-3" /> : <UploadIcon className="w-3 h-3" />}
            {m.source === "ai" ? "AI 生成" : "上传"}
          </span>
          <span>{fmtSize(m.size)}</span>
          <span>{new Date(m.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {m.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded bg-[#F5F5F4] text-[#52525B]"
            >
              {t}
              <button
                type="button"
                className="text-[#C9C9C5] hover:text-red-500"
                title="移除标签"
                onClick={() => updateMut.mutate({ tags: m.tags.filter((x) => x !== t) })}
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
        <div className="mt-auto pt-1.5 flex justify-end">
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[#9CA3AF] hover:text-red-500 hover:bg-red-50"
            onClick={onDelete}
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 模型库:统一管理可上展台的 3D 模型 —— 手动上传的 .glb/.gltf + 「3D 生成」的 AI 产物。
 * 左栏综合搜索(关键词 + 来源 + 标签分类),卡片默认显示物品截图、点击才加载 3D 预览;
 * 支持就地改名与分类标签。展厅搭建器的模型台属性里「从模型库选择」即取这里的文件。
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

  /* ── 自动补 3D 预览图:缺图的模型逐个用隐形 model-viewer 截一帧 ──
     窗口可见才跑(隐藏标签页 rAF 暂停会截出空帧);失败进集合跳过不死循环 */
  const [visibleOk] = useState(() => typeof document !== "undefined" && document.visibilityState === "visible");
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const captureTarget = visibleOk
    ? (listQuery.data ?? []).find((m) => !m.thumbUrl && !failedIds.has(m.id)) ?? null
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

  const models = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  /** 标签分类(计数,按出现次数降序) */
  const tagStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of models) for (const t of m.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [models]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return models.filter((m) => {
      if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
      if (tagFilter && !m.tags.includes(tagFilter)) return false;
      if (kw && !m.name.toLowerCase().includes(kw) && !m.tags.some((t) => t.toLowerCase().includes(kw)))
        return false;
      return true;
    });
  }, [models, keyword, sourceFilter, tagFilter]);

  async function onUpload(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        await storageApi.upload(f, { ownerModule: "exhibition", folder: "model-library" });
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
            集中管理可上展台的 3D 模型:手动上传的 .glb / .gltf 与「3D 生成」的 AI 产物。
            布展时在模型台属性里「从模型库选择」即可使用。
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
          {uploading ? "上传中…" : "上传模型"}
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
                全部({models.length})
              </button>
              <button type="button" className={sideBtn(sourceFilter === "ai")} onClick={() => setSourceFilter("ai")}>
                AI 生成({models.filter((m) => m.source === "ai").length})
              </button>
              <button type="button" className={sideBtn(sourceFilter === "upload")} onClick={() => setSourceFilter("upload")}>
                上传({models.filter((m) => m.source === "upload").length})
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
              {tagStats.length === 0 && (
                <div className="px-2.5 py-1 text-[11px] text-[#C9C9C5]">还没有标签 —— 在卡片上「+标签」</div>
              )}
              {tagStats.map(([t, n]) => (
                <button key={t} type="button" className={sideBtn(tagFilter === t)} onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                  {t}({n})
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 右:模型卡片 */}
        <div>
          {listQuery.isLoading ? (
            <div className="text-sm text-[#9CA3AF] py-20 text-center">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-[#D4D4D4] rounded-xl py-20 text-center text-sm text-[#9CA3AF]">
              {models.length === 0
                ? "还没有模型 —— 点右上「上传模型」,或到「3D 生成」用一张图片生成"
                : "没有匹配的模型,换个关键词或清掉筛选试试"}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((m) => (
                <ModelCard
                  key={m.id}
                  m={m}
                  capturing={captureTarget?.id === m.id}
                  onChanged={invalidate}
                  onDelete={() => {
                    if (
                      window.confirm(`删除模型「${m.name}」?\n若有展台正在使用该模型,3D 里将显示占位物。`)
                    ) {
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
      {captureTarget && (
        <ThumbCapture key={captureTarget.id} m={captureTarget} onDone={onCaptureDone} onFail={onCaptureFail} />
      )}
    </div>
  );
}
