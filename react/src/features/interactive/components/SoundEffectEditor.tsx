import { useEffect, useRef, useState } from "react";
import { interactiveFileUrl, type SoundEffect } from "../api";

interface Props {
  label: string;
  value: SoundEffect;
  defaultUrl: string; // 内置默认音
  uploading: boolean;
  onChange: (e: SoundEffect) => void;
  onUpload: (file: File) => void;
  onClearFile: () => void;
}

/** 单个音效编辑:上传覆盖(空=内置默认)+ 循环/播放次数/延迟/音量(拖动)/播放截取(2 滑块)+ 试听 */
export function SoundEffectEditor({ label, value, defaultUrl, uploading, onChange, onUpload, onClearFile }: Props) {
  const url = value.fileId ? interactiveFileUrl(value.fileId) : defaultUrl;
  const [duration, setDuration] = useState(0);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  // 读音频时长(截取滑块量程用)—— 异步 loadedmetadata 里 setState,不在 effect 体内同步置态
  useEffect(() => {
    const a = new Audio();
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    a.addEventListener("loadedmetadata", onMeta);
    a.src = url;
    a.load();
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.src = "";
    };
  }, [url]);

  const maxT = Math.max(1, Math.ceil(duration || value.clipEnd || 30));
  const patch = (p: Partial<SoundEffect>) => onChange({ ...value, ...p });

  const preview = () => {
    const a = previewRef.current ?? (previewRef.current = new Audio());
    a.pause();
    a.src = url;
    a.volume = Math.min(1, Math.max(0, value.volume));
    const end = value.clipEnd > 0 ? value.clipEnd : Infinity;
    try {
      a.currentTime = value.clipStart || 0;
    } catch {
      /* ignore */
    }
    const onTime = () => {
      if (a.currentTime >= end) {
        a.pause();
        a.removeEventListener("timeupdate", onTime);
      }
    };
    a.addEventListener("timeupdate", onTime);
    void a.play().catch(() => {});
  };

  const clipEndVal = value.clipEnd > 0 ? value.clipEnd : maxT;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="w-20 shrink-0 text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">{value.fileId ? value.name ?? "自定义" : "内置默认"}</span>
        <div className="flex-1" />
        <button type="button" onClick={preview} className="rounded-md border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50">
          ▶ 试听
        </button>
        <label className="rounded-md border border-gray-300 px-2 py-0.5 text-xs cursor-pointer hover:bg-gray-50">
          {uploading ? "上传中…" : "上传覆盖"}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        {value.fileId && (
          <button type="button" onClick={onClearFile} className="text-xs text-gray-400 hover:text-red-500">
            用默认
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.loop} onChange={(e) => patch({ loop: e.target.checked })} />
          循环播放
        </label>
        {!value.loop && (
          <label className="flex items-center gap-2">
            播放次数
            <input
              type="number"
              min={1}
              max={20}
              value={value.playCount}
              onChange={(e) => patch({ playCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
              className="w-16 rounded border border-gray-300 px-1 py-0.5"
            />
          </label>
        )}
        <label className="flex items-center gap-2">
          延迟(秒)
          <input
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={value.delayMs / 1000}
            onChange={(e) => patch({ delayMs: Math.max(0, Math.round((Number(e.target.value) || 0) * 1000)) })}
            className="w-16 rounded border border-gray-300 px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-2">
          音量
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.volume}
            onChange={(e) => patch({ volume: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-8 text-right tabular-nums">{Math.round(value.volume * 100)}%</span>
        </label>
      </div>

      {/* 播放截取:2 个滑块 */}
      <div className="mt-2 text-xs text-gray-600">
        <div className="flex items-center justify-between">
          <span>播放截取</span>
          <span className="tabular-nums text-gray-400">
            {value.clipStart.toFixed(1)}s – {clipEndVal.toFixed(1)}s{duration ? ` / ${maxT}s` : ""}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxT}
          step={0.1}
          value={Math.min(value.clipStart, clipEndVal)}
          onChange={(e) => {
            const s = Number(e.target.value);
            patch({ clipStart: Math.min(s, clipEndVal - 0.1) });
          }}
          className="w-full"
        />
        <input
          type="range"
          min={0}
          max={maxT}
          step={0.1}
          value={clipEndVal}
          onChange={(e) => {
            const en = Number(e.target.value);
            patch({ clipEnd: en >= maxT ? 0 : Math.max(en, value.clipStart + 0.1) });
          }}
          className="w-full"
        />
      </div>
    </div>
  );
}
