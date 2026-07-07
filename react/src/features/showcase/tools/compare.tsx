import { useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { showcaseFileUrl } from "../api";
import type { ToolDef, ToolEditorProps } from "./types";
import { Caption, ImagePick, PropRow, TextInput } from "./widgets";

/** 前后对比图:转变前/后两张照片叠放 + 拖拽滑杆对比(自建,~80 行) */
export interface CompareContent extends Record<string, unknown> {
  beforeFileId?: string;
  afterFileId?: string;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string;
}

/** 叠放滑杆:after 铺底,before 用 clip-path 裁到滑杆左侧;pointer 拖动 */
function CompareSlider({ value }: { value: CompareContent }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const moveTo = (clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(Math.max(p, 2), 98));
  };

  if (!value.beforeFileId || !value.afterFileId) return null;
  return (
    <div
      ref={boxRef}
      className="relative w-full touch-none select-none overflow-hidden rounded-lg border bg-muted"
      style={{ aspectRatio: "16 / 9", cursor: dragging ? "ew-resize" : "default" }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setDragging(true);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => dragging && moveTo(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <img
        src={showcaseFileUrl(value.afterFileId)}
        alt={value.afterLabel ?? "转变后"}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <img
        src={showcaseFileUrl(value.beforeFileId)}
        alt={value.beforeLabel ?? "转变前"}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        draggable={false}
      />
      {/* 中缝把手 */}
      <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pct}%` }} />
      <div
        className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white shadow-md"
        style={{ left: `${pct}%` }}
      >
        <ArrowLeftRight className="h-4 w-4 text-gray-600" />
      </div>
      {/* 角标 */}
      <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white">
        {value.beforeLabel?.trim() || "转变前"}
      </span>
      <span className="absolute right-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white">
        {value.afterLabel?.trim() || "转变后"}
      </span>
    </div>
  );
}

function CompareEditor({ value, onChange, upload }: ToolEditorProps<CompareContent>) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <ImagePick
            className="h-32"
            fileId={value.beforeFileId}
            upload={upload}
            label="上传「转变前」照片"
            onPick={(fid) => onChange({ ...value, beforeFileId: fid })}
          />
          <TextInput
            className="w-full"
            value={value.beforeLabel}
            maxLength={20}
            placeholder="左侧角标,默认「转变前」"
            onChange={(v) => onChange({ ...value, beforeLabel: v })}
          />
        </div>
        <div className="space-y-1.5">
          <ImagePick
            className="h-32"
            fileId={value.afterFileId}
            upload={upload}
            label="上传「转变后」照片"
            onPick={(fid) => onChange({ ...value, afterFileId: fid })}
          />
          <TextInput
            className="w-full"
            value={value.afterLabel}
            maxLength={20}
            placeholder="右侧角标,默认「转变后」"
            onChange={(v) => onChange({ ...value, afterLabel: v })}
          />
        </div>
      </div>
      {value.beforeFileId && value.afterFileId && <CompareSlider value={value} />}
      <PropRow label="说明">
        <TextInput
          className="flex-1"
          value={value.caption}
          maxLength={500}
          placeholder="对比说明(选填),如「阵地改造前后对比」"
          onChange={(v) => onChange({ ...value, caption: v })}
        />
      </PropRow>
    </div>
  );
}

function CompareDisplay({ value }: { value: CompareContent }) {
  return (
    <figure>
      <CompareSlider value={value} />
      <Caption text={value.caption} />
    </figure>
  );
}

export const compareTool: ToolDef<CompareContent> = {
  type: "compare",
  label: "前后对比",
  icon: ArrowLeftRight,
  order: 3,
  description: "转变前/后两张照片,拖动滑杆直观对比变化",
  makeDefault: () => ({}),
  Editor: CompareEditor,
  Display: CompareDisplay,
  validate: (v) => {
    if (!v.beforeFileId) return "前后对比缺「转变前」照片";
    if (!v.afterFileId) return "前后对比缺「转变后」照片";
    return null;
  },
  coverOf: (v) => v.afterFileId ?? v.beforeFileId,
};
