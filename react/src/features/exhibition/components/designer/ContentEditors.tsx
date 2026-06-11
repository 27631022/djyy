import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FilmIcon,
  ImagePlusIcon,
  Loader2Icon,
  PackageIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { storageApi } from "@/features/storage";
import {
  exhibitionAssetUrl,
  type HonorWallContent,
  type ImageCaseContent,
  type ModelStandContent,
  type NoticeBoardContent,
  type Text3dContent,
  type VideoWallContent,
} from "../../lib/hallTypes";

/** 上传到展厅素材区(公开口可直接 <img>/<video> 加载) */
async function uploadAsset(file: File, hallId: string) {
  return storageApi.upload(file, { ownerModule: "exhibition", folder: hallId });
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

/* ── 图片展柜:多图 + 图注 ── */

export function ImageCaseEditor({
  value,
  hallId,
  onChange,
}: {
  value: ImageCaseContent;
  hallId: string;
  onChange: (v: ImageCaseContent) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const images = value.images ?? [];

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ images: next });
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
                onChange({ images: next });
              }}
              placeholder="图注(可空)"
              className={inputCls}
            />
            <div className="flex gap-1 text-[#9CA3AF]">
              <button type="button" className="p-0.5 hover:text-[#1A1A1A] disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="上移">
                <ArrowUpIcon className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="p-0.5 hover:text-[#1A1A1A] disabled:opacity-30" disabled={i === images.length - 1} onClick={() => move(i, 1)} title="下移">
                <ArrowDownIcon className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="p-0.5 hover:text-red-500 ml-auto" onClick={() => onChange({ images: images.filter((_, j) => j !== i) })} title="移除">
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
            const added: ImageCaseContent["images"] = [];
            for (const f of files) {
              const meta = await uploadAsset(f, hallId);
              added.push({ fileId: meta.id, caption: "" });
            }
            onChange({ images: [...images, ...added] });
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
          <UploadButton hallId={hallId} accept="image/*" label="上传封面(可空)" icon={<ImagePlusIcon className="w-3.5 h-3.5" />} onDone={(id) => onChange({ ...value, posterFileId: id })} />
        )}
      </Row>
    </div>
  );
}

/* ── 模型台:.glb + 缩放/自转 ── */

export function ModelStandEditor({
  value,
  hallId,
  onChange,
}: {
  value: ModelStandContent;
  hallId: string;
  onChange: (v: ModelStandContent) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="模型">
        {value.modelFileId ? (
          <div className="flex items-center gap-1.5 text-xs text-[#1A1A1A]">
            <PackageIcon className="w-4 h-4 text-emerald-600" />
            已上传 .glb
            <button type="button" className="p-1 text-[#9CA3AF] hover:text-red-500" title="移除模型" onClick={() => onChange({ ...value, modelFileId: undefined })}>
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <UploadButton hallId={hallId} accept=".glb,.gltf" label="上传 .glb 模型" icon={<PackageIcon className="w-3.5 h-3.5" />} onDone={(id) => onChange({ ...value, modelFileId: id })} />
        )}
      </Row>
      <Row label="缩放">
        <input
          type="number" step={0.1} min={0.1} max={20}
          value={value.scale ?? 1}
          onChange={(e) => onChange({ ...value, scale: Number(e.target.value) || 1 })}
          className={inputCls}
        />
      </Row>
      <Row label="自动旋转">
        <Switch checked={value.autorotate ?? false} onCheckedChange={(b) => onChange({ ...value, autorotate: b })} />
      </Row>
      <p className="text-[10px] text-[#9CA3AF] leading-relaxed">提示:可在「3D 生成」页用 AI 出 .glb 后下载再上传到这里。</p>
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
      <Row label="字高(m)">
        <input type="number" step={0.05} min={0.1} max={3} value={value.sizeM ?? 0.6} onChange={(e) => onChange({ ...value, sizeM: Number(e.target.value) || 0.6 })} className={inputCls} />
      </Row>
      <Row label="厚度(m)">
        <input type="number" step={0.02} min={0.02} max={0.6} value={value.depthM ?? 0.12} onChange={(e) => onChange({ ...value, depthM: Number(e.target.value) || 0.12 })} className={inputCls} />
      </Row>
      <Row label="颜色">
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
    </div>
  );
}
