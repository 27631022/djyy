import { useEffect, useRef, useState } from "react";
import { Orbit } from "lucide-react";
import "pannellum/build/pannellum.css";
import "pannellum/build/pannellum.js";
import { showcaseFileUrl } from "../api";
import type { ToolDef, ToolEditorProps } from "./types";
import { Caption, ImagePick, NumInput, PropRow } from "./widgets";

/**
 * 360° 全景图:equirectangular(等距圆柱投影,全景相机/手机全景模式拍的 2:1 宽图)。
 * 查看器 = pannellum(MIT,零依赖 ~21KB,combined build 挂 window.pannellum);
 * WebGL 不可用/未加载成功 → 降级普通 <img>(契约不变,可整体替换实现)。
 */
export interface Pano360Content extends Record<string, unknown> {
  fileId?: string;
  caption?: string;
  initialYaw?: number;
}

interface PannellumViewer {
  destroy(): void;
}

declare global {
  interface Window {
    pannellum?: {
      viewer(el: HTMLElement, cfg: Record<string, unknown>): PannellumViewer;
    };
  }
}

function PanoViewer({ fileId, initialYaw }: { fileId: string; initialYaw?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // pannellum 全局是否就绪在渲染期即可判定(useState 初始化器,不在 effect 里 setState);
  // WebGL 不可用等运行期失败由 pannellum 自己在容器内渲染提示,无需我们转降级态
  const [available] = useState(() => typeof window !== "undefined" && !!window.pannellum);

  useEffect(() => {
    const el = boxRef.current;
    const pn = window.pannellum;
    if (!el || !pn) return;
    let viewer: PannellumViewer | null = null;
    try {
      viewer = pn.viewer(el, {
        type: "equirectangular",
        panorama: showcaseFileUrl(fileId),
        autoLoad: true,
        yaw: initialYaw ?? 0,
        autoRotate: -2, // 缓慢自转,提示「可拖拽环视」
        autoRotateInactivityDelay: 5000,
        showFullscreenCtrl: true,
        compass: false,
        crossOrigin: "anonymous", // dev 下 5173→3001 跨源,后端 CORS 已放行
        strings: { loadingLabel: "全景加载中…" },
      });
    } catch {
      /* 初始化异常 → 容器留空,靠下方降级图兜底不至于白屏 */
    }
    return () => {
      try {
        viewer?.destroy();
      } catch {
        /* 已销毁 */
      }
    };
  }, [fileId, initialYaw]);

  if (!available) {
    // 降级:可横向滚动的宽图(pannellum 脚本未挂上时)
    return (
      <div className="overflow-x-auto rounded-lg border bg-muted">
        <img src={showcaseFileUrl(fileId)} alt="全景图" className="h-72 max-w-none" />
      </div>
    );
  }
  return <div ref={boxRef} className="h-[380px] w-full overflow-hidden rounded-lg border bg-black" />;
}

function Pano360Editor({ value, onChange, upload }: ToolEditorProps<Pano360Content>) {
  return (
    <div className="space-y-3">
      <ImagePick
        className="h-32"
        fileId={value.fileId}
        upload={upload}
        label="上传全景照片(手机全景模式 / 全景相机拍的 2:1 宽图)"
        onPick={(fid) => onChange({ ...value, fileId: fid })}
      />
      {value.fileId && <PanoViewer fileId={value.fileId} initialYaw={value.initialYaw} />}
      <PropRow label="初始朝向">
        <NumInput
          className="w-28"
          value={value.initialYaw}
          placeholder="0"
          onChange={(v) => onChange({ ...value, initialYaw: v })}
        />
        <span className="text-xs text-muted-foreground">度(-180 ~ 180,打开时朝向)</span>
      </PropRow>
      <PropRow label="说明">
        <input
          type="text"
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          value={value.caption ?? ""}
          maxLength={300}
          placeholder="场景说明(选填)"
          onChange={(e) => onChange({ ...value, caption: e.target.value || undefined })}
        />
      </PropRow>
    </div>
  );
}

function Pano360Display({ value }: { value: Pano360Content }) {
  if (!value.fileId) return null;
  return (
    <figure>
      <PanoViewer fileId={value.fileId} initialYaw={value.initialYaw} />
      <Caption text={value.caption} />
    </figure>
  );
}

export const pano360Tool: ToolDef<Pano360Content> = {
  type: "pano360",
  label: "360°全景",
  icon: Orbit,
  order: 4,
  description: "上传全景照片,360° 拖拽环视(支持全屏)",
  makeDefault: () => ({}),
  Editor: Pano360Editor,
  Display: Pano360Display,
  validate: (v) => (v.fileId ? null : "360°全景还没上传全景照片"),
  coverOf: (v) => v.fileId,
};
