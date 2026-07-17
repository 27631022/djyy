import { useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  DownloadIcon,
  ImagePlusIcon,
  Loader2Icon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  UsersIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/shared/components/ui/dialog";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { downloadBlob } from "@/shared/lib/download";
import { storageApi } from "@/features/storage";
import {
  avatarApi,
  avatarLibraryApi,
  resolveAvatarUrl,
  avatarErrorMessage,
  type AvatarGender,
  type AvatarLibraryItem,
  type GeneratedAvatarItem,
} from "../api";

/** 公共头像库文件约定(与后端 AVATAR_LIBRARY_FOLDER 一致:公开口/GC 豁免都按它判) */
const UPLOAD_OPTS = { ownerModule: "user", folder: "avatars/library", visibility: "public" as const };

const GENDER_TABS: { key: "" | AvatarGender; label: string }[] = [
  { key: "", label: "全部" },
  { key: "male", label: "男" },
  { key: "female", label: "女" },
  { key: "neutral", label: "通用" },
];

const GENDER_LABEL: Record<AvatarGender, string> = { male: "男", female: "女", neutral: "通用" };

/** 单卡片:缩略图 + 就地改名 + 性别 + 悬浮操作(预览点图) */
function ItemCard({
  item,
  selected,
  onToggleSelect,
  onPreview,
}: {
  item: AvatarLibraryItem;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  const updateMut = useMutation({
    mutationFn: (body: { name?: string; gender?: AvatarGender }) =>
      avatarLibraryApi.update(item.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avatar-library"] });
      setEditing(false);
    },
    onError: (e) => toast.error(avatarErrorMessage(e, "保存失败")),
  });

  const download = async () => {
    try {
      const blob = await storageApi.fetchBlob(item.fileId);
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      downloadBlob(blob, `${item.name}.${ext}`);
    } catch (e) {
      toast.error(avatarErrorMessage(e, "下载失败"));
    }
  };

  return (
    <div
      className={`group relative rounded-lg border bg-white overflow-hidden transition-shadow hover:shadow-md ${
        selected ? "ring-2 ring-[var(--party-primary)]" : ""
      }`}
    >
      {/* 选择框(批量删除用) */}
      <button
        type="button"
        onClick={onToggleSelect}
        className={`absolute left-1.5 top-1.5 z-10 h-5 w-5 rounded border bg-white/90 grid place-items-center transition-opacity ${
          selected ? "opacity-100 border-[var(--party-primary)]" : "opacity-0 group-hover:opacity-100"
        }`}
        title="选择"
      >
        {selected && <CheckIcon className="h-3.5 w-3.5 text-[var(--party-primary)]" />}
      </button>

      <button type="button" onClick={onPreview} className="block w-full" title="点击预览原图">
        <img
          src={resolveAvatarUrl(item.thumbUrl)}
          alt={item.name}
          loading="lazy"
          className="aspect-square w-full object-cover bg-neutral-100"
        />
      </button>

      <div className="p-2 space-y-1.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-6 px-1.5 text-xs"
              autoFocus
              onKeyDown={(e) => {
                // isComposing:中文输入法组合期的回车是「确认候选」,不能当保存(照 TagsInput 惯例)
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  !updateMut.isPending &&
                  draft.trim()
                ) {
                  updateMut.mutate({ name: draft.trim() });
                }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button
              type="button"
              className="shrink-0 text-emerald-600 disabled:opacity-40"
              disabled={!draft.trim() || updateMut.isPending}
              onClick={() => updateMut.mutate({ name: draft.trim() })}
              title="保存"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button type="button" className="shrink-0 text-neutral-400" onClick={() => setEditing(false)} title="取消">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="flex-1 truncate text-xs font-medium" title={item.name}>
              {item.name}
            </div>
            <button
              type="button"
              className="shrink-0 text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-neutral-700"
              onClick={() => {
                setDraft(item.name);
                setEditing(true);
              }}
              title="改名"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <select
            value={item.gender}
            onChange={(e) => updateMut.mutate({ gender: e.target.value as AvatarGender })}
            className="h-5 rounded border bg-white px-1 text-[11px] text-neutral-600"
            title="性别分组"
          >
            {(Object.keys(GENDER_LABEL) as AvatarGender[]).map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            {item.hasConfig && (
              <Link
                to={`/admin/avatar-studio?from=${item.id}`}
                className="text-neutral-400 hover:text-[var(--party-primary)]"
                title="在头像编辑器中继续编辑"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
              </Link>
            )}
            <button type="button" className="text-neutral-400 hover:text-neutral-700" onClick={download} title="下载原图">
              <DownloadIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 顶部 tab 按钮 */
function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-medium"
          : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

/** 「为无头像用户分配默认头像」按钮 + 确认对话框(先展示无头像人数)。 */
function ApplyDefaultsButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const countQ = useQuery({
    queryKey: ["avatar-library", "no-avatar-count"],
    queryFn: () => avatarLibraryApi.noAvatarCount(),
    enabled: open,
  });
  const mut = useMutation({
    mutationFn: () => avatarLibraryApi.applyDefaults(),
    onSuccess: (r) => {
      toast.success(
        `已为 ${r.assigned} 人分配默认头像${r.skipped ? `;${r.skipped} 人因无对应性别素材跳过` : ""}`,
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["avatar-library", "no-avatar-count"] });
    },
    onError: (e) => toast.error(avatarErrorMessage(e, "分配失败")),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <WandSparklesIcon className="mr-1 h-4 w-4" /> 分配默认头像
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !mut.isPending && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base">为无头像用户分配默认头像</DialogTitle>
          <p className="text-sm leading-relaxed text-neutral-600">
            将为所有<b>没有头像</b>的在职用户,按性别从公共库<b>随机</b>挑一张同性别头像(男配男、女配女)。
            已有头像 / 已自选的用户不受影响(幂等,可重复执行)。
          </p>
          <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            当前无头像用户:
            {countQ.isLoading ? (
              " …"
            ) : (
              <b className="mx-1 text-[var(--party-primary)]">{countQ.data?.count ?? 0}</b>
            )}
            人
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mut.isPending}>
              取消
            </Button>
            <Button
              disabled={mut.isPending || !countQ.data?.count}
              onClick={() => mut.mutate()}
              className="bg-[var(--party-primary)] hover:bg-[var(--party-primary)]/90"
            >
              {mut.isPending ? (
                <>
                  <Loader2Icon className="mr-1 h-4 w-4 animate-spin" /> 分配中…
                </>
              ) : (
                "确认分配"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 提升对话框:选性别 + 改名 → 把员工私有头像复制进公共库。 */
function PromoteDialog({ item, onClose }: { item: GeneratedAvatarItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(() =>
    item.originalName
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/-?头像$/, "")
      .slice(0, 80),
  );
  const [gender, setGender] = useState<AvatarGender>("neutral");
  const mut = useMutation({
    mutationFn: () =>
      avatarLibraryApi.promoteFromFile({
        sourceFileId: item.fileId,
        name: name.trim() || undefined,
        gender,
      }),
    onSuccess: () => {
      toast.success("已加入公共头像库");
      qc.invalidateQueries({ queryKey: ["avatar-library"] });
      onClose();
    },
    onError: (e) => toast.error(avatarErrorMessage(e, "提升失败")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !mut.isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-base">加入公共头像库</DialogTitle>
        <div className="flex gap-3">
          <img
            src={resolveAvatarUrl(item.url)}
            alt={item.originalName}
            className="h-24 w-24 shrink-0 rounded-lg object-cover bg-neutral-100"
          />
          <div className="flex-1 space-y-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">名称</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">性别分组</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as AvatarGender)}
                className="h-8 w-full rounded border bg-white px-2 text-sm text-neutral-700"
              >
                {(Object.keys(GENDER_LABEL) as AvatarGender[]).map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABEL[g]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-400">
          会复制一份进公共库(与员工现用头像解耦,删库不影响员工),供全员挑选。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            取消
          </Button>
          <Button
            disabled={mut.isPending || !name.trim()}
            onClick={() => mut.mutate()}
            className="bg-[var(--party-primary)] hover:bg-[var(--party-primary)]/90"
          >
            {mut.isPending ? "提交中…" : "加入公共库"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 用户头像卡(生成头像 + 提升入口) */
function GeneratedCard({ item, onPromote }: { item: GeneratedAvatarItem; onPromote: () => void }) {
  const emp = item.folder.replace(/^avatars\/?/, "") || "未归档";
  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <img
        src={resolveAvatarUrl(item.url)}
        alt={item.originalName}
        loading="lazy"
        className="aspect-square w-full object-cover bg-neutral-100"
      />
      <div className="space-y-1 p-2">
        <div className="truncate text-xs font-medium" title={item.originalName}>
          {item.originalName}
        </div>
        <div className="truncate text-[11px] text-neutral-400" title={emp}>
          {emp}
        </div>
        <Button size="sm" variant="outline" className="h-6 w-full text-[11px]" onClick={onPromote}>
          加入公共库
        </Button>
      </div>
    </div>
  );
}

/** 用户头像 tab:全员生成头像总览 + 提升。 */
function GeneratedTab() {
  const listQ = useQuery({ queryKey: ["avatar-generated"], queryFn: () => avatarApi.generated() });
  const items = listQ.data ?? [];
  const [promote, setPromote] = useState<GeneratedAvatarItem | null>(null);
  return (
    <>
      <p className="text-sm text-neutral-500">
        全员 AI 生成的头像(私有资产,仅管理员总览)。「加入公共库」可把好头像提升为大家可选(复制一份,不影响员工现用头像)。
      </p>
      {listQ.isLoading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-neutral-400">
          <Loader2Icon className="h-5 w-5 animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-neutral-400">
          还没有用户生成过头像
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {items.map((it) => (
            <GeneratedCard key={it.fileId} item={it} onPromote={() => setPromote(it)} />
          ))}
        </div>
      )}
      {promote && (
        <PromoteDialog key={promote.fileId} item={promote} onClose={() => setPromote(null)} />
      )}
    </>
  );
}

/** 公共库 tab:批量上传 + 搜索/性别筛选 + 就地改名 + 批量删除 + 预览/下载 + 分配默认头像。 */
function LibraryTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"" | AvatarGender>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<AvatarLibraryItem | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);

  const listQuery = useQuery({
    queryKey: ["avatar-library", debouncedQ, gender],
    queryFn: () => avatarLibraryApi.list({ q: debouncedQ || undefined, gender: gender || undefined }),
  });
  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  // 生效选中 = 选中集 ∩ 当前列表(切筛选/搜索/别处已删的幽灵 id 自动失效)
  const selectedActive = useMemo(() => items.filter((it) => selected.has(it.id)), [items, selected]);

  // 逐个上传入库(单个失败不阻断其余,末尾汇总)
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = [...files];
    setUploading({ done: 0, total: list.length });
    let ok = 0;
    const errors: string[] = [];
    for (const f of list) {
      let uploadedId: string | null = null;
      try {
        if (!f.type.startsWith("image/")) throw new Error("不是图片文件");
        const meta = await storageApi.upload(f, UPLOAD_OPTS);
        uploadedId = meta.id;
        await avatarLibraryApi.add({
          fileId: meta.id,
          name: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80),
        });
        ok++;
      } catch (e) {
        errors.push(`${f.name}:${avatarErrorMessage(e, "失败")}`);
        if (uploadedId) {
          try {
            await storageApi.remove(uploadedId);
          } catch {
            /* 静默:补偿尽力而为 */
          }
        }
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["avatar-library"] });
    if (errors.length === 0) toast.success(`已入库 ${ok} 个头像`);
    else toast.error(`入库 ${ok} 成功 / ${errors.length} 失败`, { description: errors.slice(0, 3).join("; ") });
  };

  const removeMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const removed: string[] = [];
      const failed: string[] = [];
      for (const id of ids) {
        try {
          await avatarLibraryApi.remove(id);
          removed.push(id);
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 404) removed.push(id);
          else failed.push(id);
        }
      }
      return { removed, failed };
    },
    onSuccess: ({ removed, failed }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["avatar-library"] });
      if (failed.length === 0) toast.success(`已删除 ${removed.length} 个头像`);
      else toast.error(`删除 ${removed.length} 成功 / ${failed.length} 失败,失败项仍保持选中,可重试`);
    },
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-neutral-500">
          全平台共享的公共头像:批量上传入库(自动缩略图),供个人挑选、无头像用户默认分配、互动游戏使用
        </p>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜名称…"
              className="h-9 w-44 pl-7"
            />
          </div>
          <ApplyDefaultsButton />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={!!uploading}
            className="bg-[var(--party-primary)] hover:bg-[var(--party-primary)]/90"
          >
            {uploading ? (
              <>
                <Loader2Icon className="mr-1 h-4 w-4 animate-spin" />
                上传中 {uploading.done}/{uploading.total}
              </>
            ) : (
              <>
                <ImagePlusIcon className="mr-1 h-4 w-4" />
                上传头像
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GENDER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setGender(t.key);
              setSelected(new Set()); // 切分组清选中,防误删屏幕外条目
            }}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              gender === t.key
                ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-medium"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="text-xs text-neutral-400">共 {items.length} 个</span>
        {selectedActive.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-7"
            disabled={removeMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `确定删除选中的 ${selectedActive.length} 个头像?文件会一并删除(正被用户使用的头像会保留原图)。`,
                )
              ) {
                removeMut.mutate(selectedActive.map((it) => it.id));
              }
            }}
          >
            <Trash2Icon className="mr-1 h-3.5 w-3.5" />
            删除选中({selectedActive.length})
          </Button>
        )}
      </div>

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-neutral-400">
          <Loader2Icon className="h-5 w-5 animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-neutral-400">
          {debouncedQ || gender ? "没有匹配的头像" : "库是空的 —— 点右上角「上传头像」批量入库"}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              selected={selected.has(it.id)}
              onToggleSelect={() => toggleSelect(it.id)}
              onPreview={() => setPreview(it)}
            />
          ))}
        </div>
      )}

      {/* 原图预览 */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="text-base">{preview?.name}</DialogTitle>
          {preview && (
            <img
              src={resolveAvatarUrl(preview.url)}
              alt={preview.name}
              className="w-full rounded-lg bg-neutral-100"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 头像库管理页(/admin/avatar-library,菜单权限 avatar:manage)。
 * 两 tab:公共库(全平台共享素材,批量上传/改名/删除 + 无头像用户默认分配)/ 用户头像(全员生成头像总览 + 提升进公共库)。
 */
export default function AvatarLibrary() {
  const [tab, setTab] = useState<"library" | "generated">("library");
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">头像库</h1>
        <div className="flex gap-1.5">
          <TabBtn active={tab === "library"} onClick={() => setTab("library")} icon={ImagePlusIcon}>
            公共库
          </TabBtn>
          <TabBtn active={tab === "generated"} onClick={() => setTab("generated")} icon={UsersIcon}>
            用户头像
          </TabBtn>
        </div>
      </div>
      {tab === "library" ? <LibraryTab /> : <GeneratedTab />}
    </div>
  );
}
