import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FilmIcon,
  ImagePlusIcon,
  LibraryIcon,
  Loader2Icon,
  PackageIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { storageApi } from "@/features/storage";
import { modelLibraryApi } from "../../api";
import {
  exhibitionAssetUrl,
  type HonorWallContent,
  type ImageCaseContent,
  type ModelStandContent,
  type NoticeBoardContent,
  type Text3dContent,
  type VideoWallContent,
  type WallDecorContent,
} from "../../lib/hallTypes";
import { WALL_DECOR_PRESETS } from "../../lib/hallUtils";
import { groupModels, TIER_ORDER, fmtSize } from "../../lib/modelTiers";

/** 上传到展厅素材区(公开口可直接 <img>/<video> 加载) */
async function uploadAsset(file: File, hallId: string) {
  return storageApi.upload(file, { ownerModule: "exhibition", folder: hallId });
}

/** 从视频抓一帧做封面(素材口同源,canvas 不被污染);取约 10% 处一帧,返回 JPEG Blob */
async function captureVideoFrame(url: string): Promise<Blob> {
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.crossOrigin = "anonymous";
  v.preload = "auto";
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error("视频加载失败"));
  });
  await new Promise<void>((res) => {
    v.onseeked = () => res();
    v.currentTime = Math.min(1, (Number.isFinite(v.duration) ? v.duration : 2) * 0.1);
  });
  const cv = document.createElement("canvas");
  cv.width = v.videoWidth || 1280;
  cv.height = v.videoHeight || 720;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas 不可用");
  ctx.drawImage(v, 0, 0, cv.width, cv.height);
  return await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("截图失败"))), "image/jpeg", 0.9),
  );
}

/* ── 小部件 ── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 flex-shrink-0 text-[#6B7280]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full px-2 py-1 text-xs rounded border border-[#E5E5E5] focus:border-[var(--party-primary)] focus:outline-none bg-white";

/** 通用上传按钮(单文件) */
function UploadButton({
  hallId,
  accept,
  label,
  icon,
  onDone,
}: {
  hallId: string;
  accept: string;
  label: string;
  icon?: React.ReactNode;
  onDone: (fileId: string, name: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
      >
        {busy ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : icon}
        {busy ? "上传中…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            const meta = await uploadAsset(f, hallId);
            onDone(meta.id, meta.originalName);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "上传失败");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/* ── 图片展柜:横竖屏 + 正/背面独立图列 + 图下介绍 ── */

/** 一面的图片列表(上传/图下介绍/排序/移除),正面与背面各挂一份 */
function ImageList({
  images,
  hallId,
  onChange,
}: {
  images: NonNullable<ImageCaseContent["images"]>;
  hallId: string;
  onChange: (imgs: ImageCaseContent["images"]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {images.map((img, i) => (
        <div key={`${img.fileId}-${i}`} className="flex gap-2 items-start border border-[#F0F0F0] rounded p-1.5">
          {img.fileId ? (
            <img src={exhibitionAssetUrl(img.fileId)} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0 bg-[#F5F5F4]" />
          ) : (
            <div className="w-12 h-12 rounded bg-[#F5F5F4] flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <input
              value={img.caption ?? ""}
              onChange={(e) => {
                const next = [...images];
                next[i] = { ...img, caption: e.target.value };
                onChange(next);
              }}
              placeholder="图下介绍(可空,渲染为说明条)"
              className={inputCls}
            />
            <div className="flex gap-1 text-[#9CA3AF]">
              <button type="button" className="p-0.5 hover:text-[#1A1A1A] disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="上移">
                <ArrowUpIcon className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="p-0.5 hover:text-[#1A1A1A] disabled:opacity-30" disabled={i === images.length - 1} onClick={() => move(i, 1)} title="下移">
                <ArrowDownIcon className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="p-0.5 hover:text-red-500 ml-auto" onClick={() => onChange(images.filter((_, j) => j !== i))} title="移除">
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
      >
        {busy ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <ImagePlusIcon className="w-3.5 h-3.5" />}
        {busy ? "上传中…" : "添加图片(可多选)"}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length === 0) return;
          setBusy(true);
          try {
            const added: NonNullable<ImageCaseContent["images"]> = [];
            for (const f of files) {
              const meta = await uploadAsset(f, hallId);
              added.push({ fileId: meta.id, caption: "" });
            }
            onChange([...images, ...added]);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "上传失败");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function ImageCaseEditor({
  value,
  hallId,
  onChange,
}: {
  value: ImageCaseContent;
  hallId: string;
  onChange: (v: ImageCaseContent) => void;
}) {
  const [side, setSide] = useState<"front" | "back">("front");
  const front = value.images ?? [];
  const back = value.backImages ?? [];

  return (
    <div className="space-y-2">
      <Row label="板式">
        <select
          value={value.orientation ?? "landscape"}
          onChange={(e) => onChange({ ...value, orientation: e.target.value as ImageCaseContent["orientation"] })}
          className={inputCls}
        >
          <option value="landscape">横屏(宽幅)</option>
          <option value="portrait">竖屏(高幅)</option>
        </select>
      </Row>
      <Row label="显示底座">
        <Switch checked={value.showBase !== false} onCheckedChange={(b) => onChange({ ...value, showBase: b })} />
      </Row>
      {value.showBase === false && (
        <p className="text-[10px] text-[#9CA3AF] -mt-1">不出底座:展板按上方「高(m)」悬空/贴墙摆放。</p>
      )}
      <div className="flex gap-1">
        {(["front", "back"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`flex-1 px-2 py-1 text-xs rounded border ${side === s ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5" : "border-[#E5E5E5] text-[#6B7280]"}`}
          >
            {s === "front" ? "正面" : back.length === 0 ? "背面(沿用正面)" : "背面"}
          </button>
        ))}
      </div>
      {side === "front" ? (
        <ImageList images={front} hallId={hallId} onChange={(imgs) => onChange({ ...value, images: imgs ?? [] })} />
      ) : (
        <ImageList images={back} hallId={hallId} onChange={(imgs) => onChange({ ...value, backImages: imgs?.length ? imgs : undefined })} />
      )}
      <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
        每面展示第 1 张图;背面不传图时沿用正面(正面有第 2 张则背面用第 2 张)。
      </p>
    </div>
  );
}

/* ── 视频展墙:视频 + 海报 ── */

export function VideoWallEditor({
  value,
  hallId,
  onChange,
}: {
  value: VideoWallContent;
  hallId: string;
  onChange: (v: VideoWallContent) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const capturePoster = async () => {
    if (!value.videoFileId) return;
    setCapturing(true);
    try {
      const blob = await captureVideoFrame(exhibitionAssetUrl(value.videoFileId));
      const meta = await uploadAsset(new File([blob], "poster.jpg", { type: "image/jpeg" }), hallId);
      onChange({ ...value, posterFileId: meta.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "截取封面失败");
    } finally {
      setCapturing(false);
    }
  };
  return (
    <div className="space-y-2">
      <Row label="视频">
        {value.videoFileId ? (
          <div className="flex items-center gap-1.5">
            <video src={exhibitionAssetUrl(value.videoFileId)} className="w-24 h-14 rounded bg-black object-cover" muted />
            <button type="button" className="p-1 text-[#9CA3AF] hover:text-red-500" title="移除视频" onClick={() => onChange({ ...value, videoFileId: undefined })}>
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <UploadButton hallId={hallId} accept="video/mp4,video/webm" label="上传视频(mp4/webm)" icon={<FilmIcon className="w-3.5 h-3.5" />} onDone={(id) => onChange({ ...value, videoFileId: id })} />
        )}
      </Row>
      <Row label="封面图">
        {value.posterFileId ? (
          <div className="flex items-center gap-1.5">
            <img src={exhibitionAssetUrl(value.posterFileId)} alt="" className="w-24 h-14 rounded object-cover bg-[#F5F5F4]" />
            <button type="button" className="p-1 text-[#9CA3AF] hover:text-red-500" title="移除封面" onClick={() => onChange({ ...value, posterFileId: undefined })}>
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {value.videoFileId && (
              <button
                type="button"
                disabled={capturing}
                onClick={() => void capturePoster()}
                title="抓取视频中的一帧画面做封面"
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
              >
                {capturing ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <FilmIcon className="w-3.5 h-3.5" />}
                {capturing ? "截取中…" : "从视频截取"}
              </button>
            )}
            <UploadButton hallId={hallId} accept="image/*" label="上传图片" icon={<ImagePlusIcon className="w-3.5 h-3.5" />} onDone={(id) => onChange({ ...value, posterFileId: id })} />
          </div>
        )}
      </Row>
      <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
        封面 = 视频播放前/墙面显示的图。可「从视频截取」一帧,也可上传专门的图片。
      </p>
    </div>
  );
}

/* ── 模型台:.glb/.gltf + 配套贴图 + 形状/台面高/缩放/自转 + 介绍牌 ── */

/** 贴图散文件多选上传(glb 引用外链贴图时配套传,运行时按文件名解析) */
function TextureMultiUpload({
  hallId,
  onDone,
}: {
  hallId: string;
  onDone: (files: { fileId: string; name: string }[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
      >
        {busy ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <ImagePlusIcon className="w-3.5 h-3.5" />}
        {busy ? "上传中…" : "上传贴图(可多选)"}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          try {
            const out: { fileId: string; name: string }[] = [];
            for (const f of files) {
              const meta = await uploadAsset(f, hallId);
              out.push({ fileId: meta.id, name: meta.originalName });
            }
            onDone(out);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "贴图上传失败");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/**
 * 「从模型库选择」展开面板:缩略图网格(像模型库页),每个模型直接点 大/中/小 导入对应版本。
 * 集显电脑选「小/中」更流畅;只有一档的就一个按钮。
 */
function ModelLibraryPicker({ onPick }: { onPick: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const listQuery = useQuery({
    queryKey: ["exhibition", "model-library"],
    queryFn: () => modelLibraryApi.list(),
    enabled: open,
  });
  const groups = groupModels(listQuery.data ?? []);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <LibraryIcon className="w-3.5 h-3.5" />
        从模型库选择
      </button>
      {open && (
        <div className="mt-1.5 border border-[#ECECEC] rounded p-2 max-h-72 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="px-1 py-3 text-[11px] text-[#9CA3AF]">加载中…</div>
          ) : groups.length === 0 ? (
            <div className="px-1 py-3 text-[11px] text-[#9CA3AF]">
              模型库为空 —— 到「3D 展厅 → 模型库」上传,或「3D 生成」出一个
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {groups.map((g) => (
                <div key={g.key} className="border border-[#ECECEC] rounded-lg overflow-hidden">
                  <div className="aspect-[4/3] bg-[#F5F5F4] flex items-center justify-center">
                    {g.rep.thumbUrl ? (
                      <img src={g.rep.thumbUrl} alt={g.base} className="w-full h-full object-contain" />
                    ) : (
                      <PackageIcon className="w-8 h-8 text-[#C9C9C5]" />
                    )}
                  </div>
                  <div className="p-1.5 space-y-1">
                    <div className="flex items-center gap-1 min-w-0">
                      {g.source === "ai" ? (
                        <SparklesIcon className="w-3 h-3 text-violet-500 flex-shrink-0" />
                      ) : (
                        <UploadIcon className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      )}
                      <span className="text-[11px] truncate" title={g.base}>{g.base}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {TIER_ORDER.map((t) => {
                        const f = g.tiers[t];
                        if (!f) return null;
                        return (
                          <button
                            key={t}
                            type="button"
                            title={`导入「${t}」版 · ${fmtSize(f.size)}`}
                            onClick={() => {
                              onPick(f.id, f.name);
                              setOpen(false);
                            }}
                            className="flex-1 px-1 py-0.5 rounded border border-[#E5E5E5] text-[#52525B] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-party-soft leading-tight"
                          >
                            <span className="block text-[11px] font-medium">{t}</span>
                            <span className="block text-[9px] opacity-70">{fmtSize(f.size)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ModelStandEditor({
  value,
  hallId,
  onChange,
}: {
  value: ModelStandContent;
  hallId: string;
  onChange: (v: ModelStandContent) => void;
}) {
  const textures = value.textures ?? [];
  return (
    <div className="space-y-2">
      <Row label="模型">
        {value.modelFileId ? (
          <div className="flex items-center gap-1.5 text-xs text-[#1A1A1A] min-w-0">
            <PackageIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="truncate" title={value.modelName}>{value.modelName ?? "已上传 .glb"}</span>
            <button
              type="button"
              className="p-1 text-[#9CA3AF] hover:text-red-500 flex-shrink-0"
              title="移除模型"
              onClick={() => onChange({ ...value, modelFileId: undefined, modelName: undefined, textures: undefined })}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <UploadButton
            hallId={hallId}
            accept=".glb,.gltf"
            label="上传 .glb 模型"
            icon={<PackageIcon className="w-3.5 h-3.5" />}
            onDone={(id, name) => onChange({ ...value, modelFileId: id, modelName: name })}
          />
        )}
      </Row>
      <ModelLibraryPicker
        onPick={(id, name) =>
          onChange({ ...value, modelFileId: id, modelName: name, textures: undefined })
        }
      />
      {value.modelFileId && (
        <Row label="贴图">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TextureMultiUpload hallId={hallId} onDone={(files) => onChange({ ...value, textures: [...textures, ...files] })} />
            {textures.length > 0 && (
              <span className="text-[10px] text-[#6B7280]">
                已传 {textures.length} 张
                <button type="button" className="ml-1 text-[#9CA3AF] hover:text-red-500 underline" onClick={() => onChange({ ...value, textures: undefined })}>
                  清空
                </button>
              </span>
            )}
          </div>
        </Row>
      )}
      {value.modelFileId && (
        <Row label="模型朝向">
          <select
            value={value.upAxis ?? "y"}
            onChange={(e) => onChange({ ...value, upAxis: e.target.value === "z" ? "z" : "y" })}
            className={inputCls}
          >
            <option value="y">标准(Y 朝上)</option>
            <option value="z">横倒摆正(模型显示成竖立时选这个)</option>
          </select>
        </Row>
      )}
      <Row label="台体形状">
        <select
          value={value.shape ?? "round"}
          onChange={(e) => onChange({ ...value, shape: e.target.value === "rect" ? "rect" : "round" })}
          className={inputCls}
        >
          <option value="round">圆形</option>
          <option value="rect">长方形</option>
        </select>
      </Row>
      <Row label="台面高(m)">
        <input
          type="number" step={0.05} min={0} max={1.6}
          value={value.standH ?? 1.0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...value, standH: Math.min(1.6, Math.max(0, Number.isFinite(n) ? n : 1.0)) });
          }}
          className={inputCls}
        />
      </Row>
      {(value.standH ?? 1.0) < 0.12 && (
        <p className="text-[10px] text-[#9CA3AF] -mt-1">高度 0:不出台身,展品直接落地(适合汽车等大件)</p>
      )}
      <Row label="玻璃罩">
        <Switch checked={value.dome !== false} onCheckedChange={(b) => onChange({ ...value, dome: b })} />
      </Row>
      <Row label="模型缩放">
        <input
          type="number" step={0.1} min={0.1} max={20}
          value={value.scale ?? 1}
          onChange={(e) => onChange({ ...value, scale: Number(e.target.value) || 1 })}
          className={inputCls}
        />
      </Row>
      <Row label="自动旋转">
        <Switch checked={value.autorotate !== false} onCheckedChange={(b) => onChange({ ...value, autorotate: b })} />
      </Row>
      <div className="space-y-1">
        <span className="text-xs text-[#6B7280]">介绍信息(非空时台旁立介绍牌)</span>
        <textarea
          value={value.intro ?? ""}
          onChange={(e) => onChange({ ...value, intro: e.target.value })}
          placeholder="展品名称、来历、亮点等,一两段即可"
          rows={4}
          className={`${inputCls} resize-y leading-relaxed`}
        />
      </div>
      <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
        台面长宽用上方「宽/深」调;模型若引用外部贴图散文件(加载出来是白模),把贴图一并上传即可按文件名自动配上。
      </p>
    </div>
  );
}

/* ── 荣誉墙条目 ── */

export function HonorItemsEditor({
  value,
  hallId,
  onChange,
}: {
  value: HonorWallContent;
  hallId: string;
  onChange: (v: HonorWallContent) => void;
}) {
  const items = value.items ?? [];
  const patch = (i: number, p: Partial<HonorWallContent["items"][number]>) => {
    const next = [...items];
    next[i] = { ...next[i], ...p };
    onChange({ items: next });
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="border border-[#F0F0F0] rounded p-1.5 space-y-1">
          <div className="flex gap-1">
            <input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="荣誉名称" className={inputCls} />
            <button type="button" className="p-1 text-[#9CA3AF] hover:text-red-500 flex-shrink-0" onClick={() => onChange({ items: items.filter((_, j) => j !== i) })}>
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-1">
            <input value={it.level ?? ""} onChange={(e) => patch(i, { level: e.target.value })} placeholder="级别(如 国家级)" className={inputCls} />
            <input value={it.year ?? ""} onChange={(e) => patch(i, { year: e.target.value })} placeholder="年份" className={`${inputCls} w-20 flex-shrink-0`} style={{ width: 72 }} />
          </div>
          <div className="flex items-center gap-1.5">
            {it.imageFileId ? (
              <>
                <img src={exhibitionAssetUrl(it.imageFileId)} alt="" className="w-10 h-10 object-cover rounded bg-[#F5F5F4]" />
                <button type="button" className="p-0.5 text-[#9CA3AF] hover:text-red-500" onClick={() => patch(i, { imageFileId: undefined })}>
                  <XIcon className="w-3 h-3" />
                </button>
              </>
            ) : (
              <UploadButton hallId={hallId} accept="image/*" label="证书图(可空)" icon={<ImagePlusIcon className="w-3 h-3" />} onDone={(id) => patch(i, { imageFileId: id })} />
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ items: [...items, { title: "" }] })}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        添加荣誉
      </button>
    </div>
  );
}

/* ── 党务公开板条目 ── */

export function NoticeItemsEditor({
  value,
  onChange,
}: {
  value: NoticeBoardContent;
  onChange: (v: NoticeBoardContent) => void;
}) {
  const items = value.items ?? [];
  const patch = (i: number, p: Partial<NoticeBoardContent["items"][number]>) => {
    const next = [...items];
    next[i] = { ...next[i], ...p };
    onChange({ items: next });
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="border border-[#F0F0F0] rounded p-1.5 space-y-1">
          <div className="flex gap-1">
            <input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="公示标题" className={inputCls} />
            <button type="button" className="p-1 text-[#9CA3AF] hover:text-red-500 flex-shrink-0" onClick={() => onChange({ items: items.filter((_, j) => j !== i) })}>
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          </div>
          <input value={it.date ?? ""} onChange={(e) => patch(i, { date: e.target.value })} placeholder="日期(如 2026-06)" className={inputCls} />
          <textarea
            value={it.body ?? ""}
            onChange={(e) => patch(i, { body: e.target.value })}
            placeholder="正文(可空)"
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ items: [...items, { title: "" }] })}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        添加条目
      </button>
    </div>
  );
}

/* ── 文化墙挂件 ── */

const WALL_DECOR_TPL_LABEL: Record<string, string> = {
  party_red: "党务公开栏(红飘带金边)",
  blue_tech: "厂务公开栏(金属框蓝科技)",
  honor_red: "荣誉墙(红金相框阵列)",
};

export function WallDecorEditor({
  value,
  onChange,
}: {
  value: WallDecorContent;
  onChange: (v: WallDecorContent) => void;
}) {
  const tpl = value.template ?? "party_red";
  const panels = value.panels ?? [];
  const maxPanels = tpl === "party_red" ? 6 : 8;
  const patchPanel = (i: number, name: string) => {
    const next = [...panels];
    next[i] = name;
    onChange({ ...value, panels: next });
  };
  return (
    <div className="space-y-2">
      <Row label="模板">
        <select
          value={tpl}
          onChange={(e) => {
            // 切模板 = 整体重置为该模板预设(标题/栏目/行列都换默认,避免跨模板残留)
            const preset = WALL_DECOR_PRESETS.find((p) => p.content.template === e.target.value);
            onChange(preset ? { ...preset.content } : { template: e.target.value as WallDecorContent["template"] });
          }}
          className={inputCls}
        >
          {WALL_DECOR_PRESETS.map((p) => (
            <option key={p.content.template} value={p.content.template}>
              {WALL_DECOR_TPL_LABEL[p.content.template ?? ""] ?? p.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="主标题">
        <input
          value={value.title ?? ""}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder="如:党务公开栏"
          className={inputCls}
        />
      </Row>
      {tpl === "honor_red" ? (
        <>
          <Row label="相框排数">
            <input
              type="number"
              min={1}
              max={4}
              value={value.rows ?? 3}
              onChange={(e) => onChange({ ...value, rows: Math.min(Math.max(Number(e.target.value) || 3, 1), 4) })}
              className={inputCls}
            />
          </Row>
          <Row label="每排格数">
            <input
              type="number"
              min={2}
              max={7}
              value={value.cols ?? 5}
              onChange={(e) => onChange({ ...value, cols: Math.min(Math.max(Number(e.target.value) || 5, 2), 7) })}
              className={inputCls}
            />
          </Row>
          <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
            相框阵列当前为造型展示(空白相框),后续可接入证书系统自动填充荣誉。
          </p>
        </>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[11px] text-[#6B7280]">栏目板(从左到右)</div>
          {panels.map((name, i) => (
            <div key={i} className="flex gap-1">
              <input value={name} onChange={(e) => patchPanel(i, e.target.value)} placeholder={`栏目 ${i + 1}`} className={inputCls} />
              <button
                type="button"
                className="p-1 text-[#9CA3AF] hover:text-red-500 flex-shrink-0"
                onClick={() => onChange({ ...value, panels: panels.filter((_, j) => j !== i) })}
              >
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {panels.length < maxPanels && (
            <button
              type="button"
              onClick={() => onChange({ ...value, panels: [...panels, ""] })}
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              添加栏目
            </button>
          )}
          <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
            栏目留空时按模板默认显示;最多 {maxPanels} 个,板宽随数量自动均分。
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 颜色预设色板(立体字颜色 / 厅点缀色共用) ── */

const PRESET_COLORS = ["#C8001E", "#F5A623", "#00D4FF", "#1E6FFF", "#1FA35C", "#7C3AED", "#1A1A1A", "#FFFFFF"];

export function ColorSwatches({ value, onPick }: { value?: string; onPick: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {PRESET_COLORS.map((hex) => {
        const active = (value ?? "").toUpperCase() === hex;
        return (
          <button
            key={hex}
            type="button"
            title={hex}
            onClick={() => onPick(hex)}
            className={`w-5 h-5 rounded transition-transform ${active ? "ring-2 ring-[var(--party-primary)] ring-offset-1 border border-transparent" : "border border-[#D4D4D4] hover:scale-110"}`}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  );
}

/* ── 立体字 ── */

export function Text3dEditor({
  value,
  accent,
  onChange,
}: {
  value: Text3dContent;
  accent: string;
  onChange: (v: Text3dContent) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="文字">
        <input value={value.text ?? ""} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="如:企业文化展厅" className={inputCls} />
      </Row>
      <Row label="字体">
        <select value={value.font ?? "sans"} onChange={(e) => onChange({ ...value, font: e.target.value as Text3dContent["font"] })} className={inputCls}>
          <option value="sans">黑体(思源黑体)</option>
          <option value="serif">宋体(思源宋体)</option>
        </select>
      </Row>
      <Row label="粗细">
        <select value={value.weight ?? "regular"} onChange={(e) => onChange({ ...value, weight: e.target.value as Text3dContent["weight"] })} className={inputCls}>
          <option value="light">细体</option>
          <option value="regular">常规</option>
          <option value="medium">中粗</option>
          <option value="bold">加粗</option>
          <option value="black">特粗</option>
        </select>
      </Row>
      <Row label="颜色">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={value.color ?? accent}
              onChange={(e) => onChange({ ...value, color: e.target.value })}
              className="w-8 h-6 p-0 border border-[#E5E5E5] rounded cursor-pointer"
            />
            <button type="button" className="text-[10px] text-[#9CA3AF] hover:text-[var(--party-primary)]" onClick={() => onChange({ ...value, color: undefined })}>
              用主题点缀色
            </button>
          </div>
          <ColorSwatches value={value.color ?? accent} onPick={(hex) => onChange({ ...value, color: hex })} />
        </div>
      </Row>
      <Row label="质感">
        <select value={value.finish ?? "paint"} onChange={(e) => onChange({ ...value, finish: e.target.value as Text3dContent["finish"] })} className={inputCls}>
          <option value="paint">烤漆</option>
          <option value="metal">金属</option>
          <option value="glow">发光</option>
        </select>
      </Row>
      <Row label="安装">
        <select value={value.mount ?? "wall"} onChange={(e) => onChange({ ...value, mount: e.target.value as Text3dContent["mount"] })} className={inputCls}>
          <option value="wall">贴墙</option>
          <option value="floor">落地</option>
          <option value="flat">平铺地面(地板字)</option>
        </select>
      </Row>
      <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
        文字整体宽度 = 上方「宽(m)」,高度按比例自动、厚度自动;离地高度在上方「离地(m)」调。
      </p>
    </div>
  );
}
