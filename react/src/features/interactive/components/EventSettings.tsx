import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import {
  interactiveApi,
  interactiveFileUrl,
  parseEventConfig,
  DEFAULT_SOUND_URL,
  type EventConfig,
  type InteractiveEvent,
  type SoundEffect,
  type SoundKey,
} from "../api";
import { SoundEffectEditor } from "./SoundEffectEditor";

const BG_PRESETS: { label: string; c1: string; c2: string }[] = [
  { label: "深紫夜", c1: "#241a3a", c2: "#0b0b12" },
  { label: "党建红", c1: "#5a0d16", c2: "#0b0b12" },
  { label: "科技蓝", c1: "#0b2a4a", c2: "#07101c" },
  { label: "喜庆金", c1: "#5a3a0a", c2: "#100a02" },
];

/** 首页设置:大屏首页背景 + 首页音乐(等待时)。分组对抗属节目玩法,在「节目设置」里配。 */
export function EventSettings({ event }: { event: InteractiveEvent }) {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<EventConfig>(() => parseEventConfig(event.configJson));
  const [uploading, setUploading] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () => interactiveApi.updateConfig(event.id, cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interactive", "events"] });
      toast.success("设置已保存,已即时生效");
    },
    onError: () => toast.error("保存失败,请重试"),
  });

  const bg = cfg.background;
  const music = cfg.music;

  async function upload(file: File, target: "bg" | SoundKey) {
    setUploading(target);
    try {
      const meta = await storageApi.upload(file, {
        ownerModule: "interactive",
        folder: `event-${event.id}`,
      });
      if (target === "bg") {
        setCfg((c) => ({ ...c, background: { ...c.background, kind: "image", imageFileId: meta.id } }));
      } else {
        setCfg((c) => ({
          ...c,
          music: {
            ...c.music,
            enabled: true,
            effects: {
              ...c.music.effects,
              [target]: { ...c.music.effects[target], fileId: meta.id, name: meta.originalName },
            },
          },
        }));
      }
      toast.success("上传成功,记得点「保存设置」");
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(null);
    }
  }

  const setEffect = (key: SoundKey, e: SoundEffect) =>
    setCfg((c) => ({ ...c, music: { ...c.music, effects: { ...c.music.effects, [key]: e } } }));
  const clearEffectFile = (key: SoundKey) =>
    setCfg((c) => {
      const e = c.music.effects[key];
      const next: SoundEffect = {
        loop: e.loop,
        playCount: e.playCount,
        delayMs: e.delayMs,
        volume: e.volume,
        clipStart: e.clipStart,
        clipEnd: e.clipEnd,
      };
      return { ...c, music: { ...c.music, effects: { ...c.music.effects, [key]: next } } };
    });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="font-bold">首页设置(大屏首页 · 全活动共享)</div>
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-lg px-4 py-1.5 text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--party-primary)" }}
        >
          {saveMut.isPending ? "保存中…" : "保存设置"}
        </button>
      </div>

      {/* 背景 */}
      <section>
        <div className="text-sm font-semibold text-gray-700 mb-2">大屏背景</div>
        <div className="flex gap-2 mb-3">
          {(["color", "image"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCfg((c) => ({ ...c, background: { ...c.background, kind: k } }))}
              className={`rounded-md px-3 py-1 text-sm border ${bg.kind === k ? "border-[var(--party-primary)] bg-party-soft" : "border-gray-300"}`}
            >
              {k === "color" ? "渐变色" : "背景图"}
            </button>
          ))}
        </div>
        {bg.kind === "color" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setCfg((c) => ({ ...c, background: { ...c.background, color1: p.c1, color2: p.c2 } }))}
                  className="rounded-md h-9 w-16 border border-gray-300 text-[10px] text-white flex items-end justify-center pb-0.5"
                  style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                起色
                <input type="color" value={bg.color1} onChange={(e) => setCfg((c) => ({ ...c, background: { ...c.background, color1: e.target.value } }))} />
              </label>
              <label className="flex items-center gap-2">
                止色
                <input type="color" value={bg.color2} onChange={(e) => setCfg((c) => ({ ...c, background: { ...c.background, color2: e.target.value } }))} />
              </label>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {bg.imageFileId && (
              <img src={interactiveFileUrl(bg.imageFileId)} alt="背景预览" className="w-28 h-16 object-cover rounded border border-gray-200" />
            )}
            <label className="rounded-md border border-gray-300 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
              {uploading === "bg" ? "上传中…" : bg.imageFileId ? "更换图片" : "上传背景图"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f, "bg");
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
      </section>

      {/* 首页音乐:大屏首页(未开节目的等待页)播放;各节目的 5 种音效在「节目设置」里独立配置 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-700">首页音乐(等待时)</div>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={music.enabled}
              onChange={(e) => setCfg((c) => ({ ...c, music: { ...c.music, enabled: e.target.checked } }))}
            />
            大屏播放
          </label>
        </div>
        <SoundEffectEditor
          label="首页音乐"
          value={music.effects.ready}
          defaultUrl={DEFAULT_SOUND_URL.ready}
          uploading={uploading === "ready"}
          onChange={(e) => setEffect("ready", e)}
          onUpload={(f) => upload(f, "ready")}
          onClearFile={() => clearEffectFile("ready")}
        />
        <div className="text-xs text-gray-400 mt-2">
          只在大屏首页(没开节目时)播放;每个节目的 5 种音效在「节目设置」里**独立**配置(初始为同一套默认音,互不共用)
        </div>
      </section>

    </div>
  );
}
