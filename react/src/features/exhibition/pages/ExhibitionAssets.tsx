import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  Loader2Icon,
  Music2Icon,
  PackageIcon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import {
  ASSET_ACCEPT,
  ASSET_FOLDER,
  type AssetCategory,
  exhibitionLibraryApi,
  type GuidePreset,
  type LibraryAsset,
} from "../api";

type TabKey = "preset" | AssetCategory;

const TABS: { key: TabKey; label: string }[] = [
  { key: "preset", label: "讲解员形象包" },
  { key: "voice", label: "讲解音色" },
  { key: "wall-texture", label: "墙面贴图" },
  { key: "wall-decor", label: "墙面装饰" },
];

function fmtSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

const tabBtn = (active: boolean) =>
  `px-3.5 py-1.5 rounded-md text-sm border transition ${
    active
      ? "bg-[var(--party-primary)] text-white border-transparent"
      : "bg-white text-[#374151] border-[#D1D5DB] hover:border-[#9CA3AF]"
  }`;

const card = "rounded-lg border border-[#E5E7EB] bg-white overflow-hidden flex flex-col";
const iconBtn = "p-1.5 rounded text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#1A1A1A]";

export default function ExhibitionAssets() {
  const [tab, setTab] = useState<TabKey>("preset");
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[#1A1A1A]">展厅素材中心</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          集中管理可复用的展厅素材;上传一次,各展厅都能挑用。
          <Link to="/admin/model-library" className="text-[var(--party-primary)] hover:underline ml-1">
            3D 模型 →（模型库）
          </Link>
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tabBtn(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "preset" ? <PresetGrid /> : <FileGrid key={tab} category={tab} />}
    </div>
  );
}

/* ── 讲解员形象包 ── */

function PresetGrid() {
  const qc = useQueryClient();
  const { data: presets = [], isLoading } = useQuery({
    queryKey: ["exhibition", "guide-presets"],
    queryFn: exhibitionLibraryApi.listPresets,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["exhibition", "guide-presets"] });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => exhibitionLibraryApi.renamePreset(id, name),
    onSuccess: () => {
      invalidate();
      toast.success("已改名");
    },
  });
  const remove = useMutation({
    mutationFn: exhibitionLibraryApi.removePreset,
    onSuccess: () => {
      invalidate();
      toast.success("已删除形象包");
    },
  });

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2 text-xs text-[#6B7280]">
        💡 形象包在「展厅管理 → 布展 → 解说员设置」里配好后点「存为形象包」生成;之后在任意展厅一键套用整套。
      </div>
      {isLoading ? (
        <div className="text-sm text-[#9CA3AF] py-8 text-center">加载中…</div>
      ) : presets.length === 0 ? (
        <div className="text-sm text-[#9CA3AF] py-8 text-center">还没有形象包</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {presets.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              onRename={(name) => rename.mutate({ id: p.id, name })}
              onRemove={() => remove.mutate(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PresetCard({
  preset,
  onRename,
  onRemove,
}: {
  preset: GuidePreset;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preset.name);
  const c = preset.config;
  const isSprite = c.kind === "sprite" && !!c.spriteUrl;
  return (
    <div className={card}>
      <div className="aspect-square bg-[#F4F4F2] flex items-center justify-center overflow-hidden">
        {isSprite ? (
          <img src={c.spriteUrl} alt={preset.name} className="w-full h-full object-contain" />
        ) : c.modelUrl ? (
          <PackageIcon className="w-10 h-10 text-emerald-600" />
        ) : (
          <UserIcon className="w-10 h-10 text-[#9CA3AF]" />
        )}
      </div>
      <div className="p-2 flex items-center gap-1">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  onRename(draft.trim());
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="flex-1 min-w-0 px-1.5 py-1 text-sm border border-[#D1D5DB] rounded"
            />
            <button
              type="button"
              className={iconBtn}
              onClick={() => {
                if (draft.trim()) onRename(draft.trim());
                setEditing(false);
              }}
            >
              <CheckIcon className="w-4 h-4 text-emerald-600" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate text-sm text-[#1A1A1A]" title={preset.name}>
              {preset.name}
            </span>
            <button type="button" className={iconBtn} title="改名" onClick={() => setEditing(true)}>
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              title="删除"
              onClick={() => {
                if (window.confirm(`删除形象包「${preset.name}」?(不影响已套用的展厅)`)) onRemove();
              }}
            >
              <Trash2Icon className="w-3.5 h-3.5 text-red-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 文件型素材(音色 / 墙面贴图 / 墙面装饰)── */

const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg)$/i;

function FileGrid({ category }: { category: AssetCategory }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["exhibition", "asset-library", category],
    queryFn: () => exhibitionLibraryApi.listAssets(category),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["exhibition", "asset-library", category] });
  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      for (const f of Array.from(files)) {
        await storageApi.upload(f, { ownerModule: "exhibition", folder: ASSET_FOLDER[category] });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("上传成功");
    },
    onError: () => toast.error("上传失败"),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      exhibitionLibraryApi.updateAsset(category, id, { name }),
    onSuccess: () => {
      invalidate();
      toast.success("已改名");
    },
  });
  const remove = useMutation({
    mutationFn: storageApi.remove,
    onSuccess: () => {
      invalidate();
      toast.success("已删除");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-white bg-[var(--party-primary)]"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
          上传素材
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ASSET_ACCEPT[category]}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) upload.mutate(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-[#9CA3AF]">
          {category === "voice"
            ? "音色参考音频(几秒清晰人声,本地 IndexTTS2 克隆用)"
            : category === "wall-texture"
              ? "墙面贴图(图片;贴到墙面功能后续接入)"
              : "墙面装饰(图片 / glb;贴到墙面功能后续接入)"}
        </span>
      </div>

      {isLoading ? (
        <div className="text-sm text-[#9CA3AF] py-8 text-center">加载中…</div>
      ) : assets.length === 0 ? (
        <div className="text-sm text-[#9CA3AF] py-8 text-center">还没有素材,点「上传素材」添加</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {assets.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              onRename={(name) => rename.mutate({ id: a.id, name })}
              onRemove={() => remove.mutate(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onRename,
  onRemove,
}: {
  asset: LibraryAsset;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(asset.name);
  const isImg = IMG_EXT.test(asset.name);
  const isAudio = AUDIO_EXT.test(asset.name);
  return (
    <div className={card}>
      <div className="aspect-square bg-[#F4F4F2] flex items-center justify-center overflow-hidden p-1">
        {isImg ? (
          <img src={asset.url} alt={asset.name} className="w-full h-full object-contain" />
        ) : isAudio ? (
          <div className="flex flex-col items-center gap-2 w-full px-2">
            <Music2Icon className="w-8 h-8 text-[var(--party-primary)]" />
            <audio controls src={asset.url} className="w-full h-8" />
          </div>
        ) : (
          <PackageIcon className="w-10 h-10 text-emerald-600" />
        )}
      </div>
      <div className="p-2 flex items-center gap-1">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  onRename(draft.trim());
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="flex-1 min-w-0 px-1.5 py-1 text-sm border border-[#D1D5DB] rounded"
            />
            <button
              type="button"
              className={iconBtn}
              onClick={() => {
                if (draft.trim()) onRename(draft.trim());
                setEditing(false);
              }}
            >
              <CheckIcon className="w-4 h-4 text-emerald-600" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate text-sm text-[#1A1A1A]" title={asset.name}>
              {asset.name}
            </span>
            <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">{fmtSize(asset.size)}</span>
            <button type="button" className={iconBtn} title="改名" onClick={() => setEditing(true)}>
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              title="删除"
              onClick={() => {
                if (window.confirm(`删除「${asset.name}」?`)) onRemove();
              }}
            >
              <Trash2Icon className="w-3.5 h-3.5 text-red-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
