import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BanIcon,
  DicesIcon,
  DownloadIcon,
  Loader2Icon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/shared/components/ui/dialog";
import { downloadBlob } from "@/shared/lib/download";
import { storageApi } from "@/features/storage";
import { avatarLibraryApi, avatarErrorMessage } from "../api";
import type { AvatarStudioConfig, StudioGender, StylePack } from "../studio/types";
import { layersOf, renderToCanvas, canvasToPngBlob, buildSvg } from "../studio/compose";
import { randomConfig, sanitizeConfig } from "../studio/random";
import { getPack } from "../studio/packs/registry";
import { useHistory } from "../studio/useHistory";

/** 头像库文件约定(与 AvatarLibrary 页一致) */
const UPLOAD_OPTS = { ownerModule: "user", folder: "avatars/library", visibility: "public" as const };

/** 背景色预设(null = 透明底) */
const BG_PRESETS: (string | null)[] = [null, "#FFFFFF", "#FFE9B8", "#F6D6DE", "#BFE3F0", "#CDE8D2", "#E4DCF7"];

const GENDER_LABEL: Record<StudioGender, string> = { male: "男", female: "女" };

/** 透明底棋盘格(预览/缩略共用) */
const CHECKER =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#eee_25%,transparent_25%,transparent_75%,#eee_75%),linear-gradient(45deg,#eee_25%,transparent_25%,transparent_75%,#eee_75%)] [background-position:0_0,8px_8px]";

/** 层叠预览(引擎 layersOf 驱动,预览与导出同源) */
function LayerStack({ pack, cfg, className }: { pack: StylePack; cfg: AvatarStudioConfig; className?: string }) {
  const layers = layersOf(pack, cfg);
  return (
    <div
      className={`relative overflow-hidden ${className ?? ""} ${cfg.bgColor ? "" : CHECKER}`}
      style={cfg.bgColor ? { backgroundColor: cfg.bgColor } : undefined}
    >
      {layers.map((l) => (
        <img key={l.slotKey} src={l.src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
      ))}
    </div>
  );
}

/** 变体缩略:基准 + 该变体 双层小预览(所见即所得) */
function VariantThumb({ pack, gender, src }: { pack: StylePack; gender: StudioGender; src?: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-100">
      <img src={pack.bases[gender]} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />}
    </div>
  );
}

function StudioInner({ pack, initial, fromName }: { pack: StylePack; initial: AvatarStudioConfig; fromName?: string }) {
  const qc = useQueryClient();
  const history = useHistory<AvatarStudioConfig>(initial);
  const cfg = history.state;
  const [activeSlot, setActiveSlot] = useState(pack.slots[0]?.key ?? "");
  const [busy, setBusy] = useState<string | null>(null); // 'png' | 'svg' | 'save'
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(fromName ?? "");
  const [pngSize, setPngSize] = useState(512);

  const slot = pack.slots.find((s) => s.key === activeSlot) ?? pack.slots[0];
  const slotVariants = useMemo(
    () => (slot ? slot.variants.filter((v) => v.gender === cfg.gender) : []),
    [slot, cfg.gender],
  );

  const apply = (next: AvatarStudioConfig) => {
    history.record();
    history.setState(next);
  };

  const pickVariant = (id: string | null) => {
    if (!slot) return;
    apply({ ...cfg, picks: { ...cfg.picks, [slot.key]: id } });
  };

  const switchGender = (g: StudioGender) => {
    if (g === cfg.gender) return;
    // 换性别:同 id 变体不跨性别复用 → 交给 sanitize 置空无效项(bgColor 由 sanitize 校验透传)
    const next = sanitizeConfig(pack, { ...cfg, gender: g });
    if (next) apply(next);
  };

  const exportPng = async () => {
    setBusy("png");
    try {
      const canvas = await renderToCanvas(layersOf(pack, cfg), pngSize, cfg.bgColor);
      downloadBlob(await canvasToPngBlob(canvas), `头像-${Date.now()}.png`);
    } catch (e) {
      toast.error(avatarErrorMessage(e, "导出失败"));
    } finally {
      setBusy(null);
    }
  };

  const exportSvg = async () => {
    setBusy("svg");
    try {
      const svg = await buildSvg(layersOf(pack, cfg), pack.canvas, cfg.bgColor);
      downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `头像-${Date.now()}.svg`);
    } catch (e) {
      toast.error(avatarErrorMessage(e, "导出失败"));
    } finally {
      setBusy(null);
    }
  };

  const saveMut = useMutation({
    mutationFn: async (name: string) => {
      const canvas = await renderToCanvas(layersOf(pack, cfg), pack.canvas, cfg.bgColor);
      const blob = await canvasToPngBlob(canvas);
      const meta = await storageApi.upload(blob, UPLOAD_OPTS, `${name}.png`);
      try {
        return await avatarLibraryApi.add({
          fileId: meta.id,
          name,
          gender: cfg.gender,
          configJson: JSON.stringify(cfg),
        });
      } catch (e) {
        // 入库失败尽力补偿删已传文件(照头像库页姿势)
        try {
          await storageApi.remove(meta.id);
        } catch {
          /* 静默 */
        }
        throw e;
      }
    },
    onSuccess: (item) => {
      setSaveOpen(false);
      qc.invalidateQueries({ queryKey: ["avatar-library"] });
      toast.success(`「${item.name}」已存入头像库(可回编辑)`);
    },
    onError: (e) => toast.error(avatarErrorMessage(e, "保存失败")),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      {/* 左:性别 + 槽位类目 + 背景色 */}
      <div className="space-y-4">
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <div className="text-xs font-medium text-neutral-500">性别</div>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
            {(Object.keys(GENDER_LABEL) as StudioGender[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => switchGender(g)}
                className={`rounded px-2 py-1.5 text-sm transition-colors ${
                  cfg.gender === g ? "bg-white font-medium shadow-sm text-[var(--party-primary)]" : "text-neutral-500"
                }`}
              >
                {GENDER_LABEL[g]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-3 space-y-1">
          <div className="mb-2 text-xs font-medium text-neutral-500">部件</div>
          {pack.slots.map((s) => {
            const picked = cfg.picks[s.key];
            const pickedLabel = picked
              ? (s.variants.find((v) => v.id === picked && v.gender === cfg.gender)?.label ?? "")
              : "无";
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveSlot(s.key)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors ${
                  activeSlot === s.key ? "bg-party-soft text-[var(--party-primary)] font-medium" : "hover:bg-neutral-50"
                }`}
              >
                <span>{s.label}</span>
                <span className="text-xs text-neutral-400">{pickedLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border bg-white p-3">
          <div className="mb-2 text-xs font-medium text-neutral-500">背景</div>
          <div className="flex flex-wrap gap-1.5">
            {BG_PRESETS.map((c) => (
              <button
                key={c ?? "none"}
                type="button"
                title={c ?? "透明底"}
                onClick={() => apply({ ...cfg, bgColor: c })}
                className={`h-7 w-7 rounded-full border grid place-items-center ${CHECKER} ${
                  (cfg.bgColor ?? null) === c ? "ring-2 ring-[var(--party-primary)]" : ""
                }`}
                style={c ? { backgroundColor: c, backgroundImage: "none" } : undefined}
              >
                {!c && <BanIcon className="h-3.5 w-3.5 text-neutral-400" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 中:大预览 + 操作 */}
      <div className="space-y-3">
        <LayerStack pack={pack} cfg={cfg} className="mx-auto aspect-square w-full max-w-[520px] rounded-xl border" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            onClick={() => apply({ ...randomConfig(pack, cfg.gender), bgColor: cfg.bgColor ?? null })}
            className="bg-[var(--party-primary)] hover:bg-[var(--party-primary)]/90"
          >
            <DicesIcon className="mr-1 h-4 w-4" /> 随机生成
          </Button>
          <Button variant="outline" size="icon" disabled={!history.canUndo} onClick={history.undo} title="撤销">
            <UndoIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={!history.canRedo} onClick={history.redo} title="重做">
            <RedoIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <select
            value={pngSize}
            onChange={(e) => setPngSize(Number(e.target.value))}
            className="h-9 rounded-md border bg-white px-2"
            title="PNG 尺寸"
          >
            {[256, 512, 1024].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={!!busy} onClick={exportPng}>
            {busy === "png" ? <Loader2Icon className="mr-1 h-4 w-4 animate-spin" /> : <DownloadIcon className="mr-1 h-4 w-4" />}
            导出 PNG
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={exportSvg}>
            {busy === "svg" ? <Loader2Icon className="mr-1 h-4 w-4 animate-spin" /> : <DownloadIcon className="mr-1 h-4 w-4" />}
            导出 SVG
          </Button>
          <Button
            disabled={!!busy || saveMut.isPending}
            onClick={() => {
              setSaveName(
                fromName ?? `${GENDER_LABEL[cfg.gender]}头像-${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`,
              );
              setSaveOpen(true);
            }}
            className="bg-[var(--party-primary)] hover:bg-[var(--party-primary)]/90"
          >
            <SaveIcon className="mr-1 h-4 w-4" /> 存入头像库
          </Button>
        </div>
        <p className="text-center text-xs text-neutral-400">
          导出的 SVG 为内嵌位图图层(非矢量线条);存入头像库的头像带配置,可从头像库回到编辑器继续编辑
        </p>
      </div>

      {/* 右:当前槽位变体网格 */}
      <div className="rounded-lg border bg-white p-3">
        <div className="mb-2 text-xs font-medium text-neutral-500">{slot?.label ?? "部件"}</div>
        <div className="grid grid-cols-2 gap-2">
          {slot?.optional && (
            <button
              type="button"
              onClick={() => pickVariant(null)}
              className={`rounded-lg border p-1.5 text-xs transition-shadow hover:shadow ${
                cfg.picks[slot.key] === null ? "ring-2 ring-[var(--party-primary)]" : ""
              }`}
            >
              <VariantThumb pack={pack} gender={cfg.gender} />
              <div className="mt-1 text-neutral-500">无</div>
            </button>
          )}
          {slotVariants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => pickVariant(v.id)}
              className={`rounded-lg border p-1.5 text-xs transition-shadow hover:shadow ${
                slot && cfg.picks[slot.key] === v.id ? "ring-2 ring-[var(--party-primary)]" : ""
              }`}
            >
              <VariantThumb pack={pack} gender={cfg.gender} src={v.src} />
              <div className="mt-1 text-neutral-600">{v.label}</div>
            </button>
          ))}
          {slotVariants.length === 0 && !slot?.optional && (
            <div className="col-span-2 py-8 text-center text-xs text-neutral-400">该性别暂无此部件</div>
          )}
        </div>
      </div>

      {/* 存库命名 */}
      <Dialog open={saveOpen} onOpenChange={(o) => !saveMut.isPending && setSaveOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base">存入头像库</DialogTitle>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            maxLength={80}
            placeholder="头像名称"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && !saveMut.isPending && saveName.trim()) {
                saveMut.mutate(saveName.trim());
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saveMut.isPending} onClick={() => setSaveOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!saveName.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate(saveName.trim())}
              className="bg-[var(--party-primary)] hover:bg-[var(--party-primary)]/90"
            >
              {saveMut.isPending && <Loader2Icon className="mr-1 h-4 w-4 animate-spin" />}保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 头像编辑器(/admin/avatar-studio,交互对标 peeps.ui8.net):
 * 左 性别/部件类目/背景色,中 大预览+随机/撤销/导出,右 变体网格。
 * ?from=<头像库条目id> = 回灌该头像的配置继续编辑(外壳取数 + key 重挂载,零同步 effect)。
 */
export default function AvatarStudio() {
  const [params, setParams] = useSearchParams();
  const urlFrom = params.get("from");
  // latch:keep-alive 隐藏渲染会剥掉 search、点当前菜单标签会冲掉 ?from —— 记住最近一次非空 from,
  // 防止 key 翻转把编辑中的会话整体重挂销毁(渲染期幂等对账,仓库先例 Users 的 skip 钳制)
  const [from, setFrom] = useState(urlFrom);
  if (urlFrom && urlFrom !== from) setFrom(urlFrom);

  const fromQuery = useQuery({
    queryKey: ["avatar-library", "detail", from],
    queryFn: () => avatarLibraryApi.detail(from!),
    enabled: !!from,
  });

  if (from && fromQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-neutral-400">
        <Loader2Icon className="h-5 w-5 animate-spin" /> 载入头像配置…
      </div>
    );
  }

  let pack = getPack(null);
  let initial: AvatarStudioConfig | null = null;
  let fromName: string | undefined;
  if (from && fromQuery.data?.configJson) {
    try {
      const parsed: unknown = JSON.parse(fromQuery.data.configJson);
      // 按存储的 packId 取风格包(将来多风格包时各回各家),未知包回退默认包再 sanitize
      pack = getPack((parsed as { packId?: string } | null)?.packId ?? null);
      initial = sanitizeConfig(pack, parsed);
      fromName = fromQuery.data.name;
    } catch {
      initial = null;
    }
  }
  // 配置缺失/损坏/风格包对不上 → 内联提示后按新建走(不用 toast:渲染期副作用违反纯度且会反复复活)
  const fallback = !!from && !initial;

  const startFresh = () => {
    setParams({}, { replace: true });
    setFrom(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">头像编辑器</h1>
          <p className="text-sm text-neutral-500">
            选部件自由组合或随机生成,导出 PNG/SVG,或存入公共头像库({pack.label})
          </p>
        </div>
        {from && initial && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={startFresh}>
            新建头像
          </Button>
        )}
      </div>
      {fallback && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          该头像没有可用的编辑配置,已按新建头像打开
        </div>
      )}
      <StudioInner
        key={initial ? `from-${from}` : "new"}
        pack={pack}
        initial={initial ?? randomConfig(pack, "male")}
        fromName={fromName}
      />
    </div>
  );
}
