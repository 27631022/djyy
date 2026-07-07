import { Camera, Plus, Trash2 } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/shared/components/ui/carousel";
import { showcaseFileUrl } from "../api";
import type { ToolDef } from "./types";
import { Caption, ImagePick, TextInput } from "./widgets";

/** 局部图:指定拍摄角度/部位的照片(单张大图;多张轮播),每张带角度标注 + 图注 */
interface SpotItem {
  fileId?: string;
  angle?: string;
  caption?: string;
}

export interface SpotContent extends Record<string, unknown> {
  items: SpotItem[];
}

function SpotFrame({ item }: { item: SpotItem }) {
  if (!item.fileId) return null;
  return (
    <figure>
      <div className="relative overflow-hidden rounded-lg border bg-muted">
        <img
          src={showcaseFileUrl(item.fileId)}
          alt={item.angle ?? ""}
          className="max-h-[420px] w-full object-contain"
          loading="lazy"
        />
        {item.angle && (
          <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white">
            <Camera className="mr-1 inline h-3 w-3" />
            {item.angle}
          </span>
        )}
      </div>
      <Caption text={item.caption} />
    </figure>
  );
}

export const spotTool: ToolDef<SpotContent> = {
  type: "spot",
  label: "局部图",
  icon: Camera,
  order: 2,
  description: "上传指定拍摄角度/部位的照片,每张标注拍摄角度,多张自动轮播",
  makeDefault: () => ({ items: [{}] }),

  Editor: ({ value, onChange, upload }) => {
    const items = value.items ?? [];
    const setItem = (i: number, patch: Partial<SpotItem>) =>
      onChange({ ...value, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
    return (
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 rounded-lg border bg-muted/20 p-2">
            <ImagePick
              className="h-28 w-40 shrink-0"
              fileId={it.fileId}
              upload={upload}
              onPick={(fid) => setItem(i, { fileId: fid })}
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <TextInput
                value={it.angle}
                maxLength={50}
                placeholder="拍摄角度/部位,如「驾驶室内部」「东南角全景」"
                onChange={(v) => setItem(i, { angle: v })}
              />
              <TextInput
                value={it.caption}
                maxLength={300}
                placeholder="图注(选填)"
                onChange={(v) => setItem(i, { caption: v })}
              />
            </div>
            {items.length > 1 && (
              <button
                type="button"
                className="self-start p-1 text-muted-foreground hover:text-red-500"
                title="删除这张"
                onClick={() => onChange({ ...value, items: items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {items.length < 20 && (
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-[var(--party-primary)] hover:underline"
            onClick={() => onChange({ ...value, items: [...items, {}] })}
          >
            <Plus className="h-4 w-4" />
            再加一张
          </button>
        )}
      </div>
    );
  },

  Display: ({ value }) => {
    const items = (value.items ?? []).filter((it) => it.fileId);
    if (items.length === 0) return null;
    if (items.length === 1) return <SpotFrame item={items[0]} />;
    return (
      <Carousel className="mx-10">
        <CarouselContent>
          {items.map((it, i) => (
            <CarouselItem key={i}>
              <SpotFrame item={it} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    );
  },

  validate: (v) => {
    const items = v.items ?? [];
    if (items.length === 0 || items.every((it) => !it.fileId)) return "局部图还没上传照片";
    if (items.some((it) => !it.fileId)) return "局部图有未上传照片的空行(补上或删除)";
    return null;
  },
  coverOf: (v) => (v.items ?? []).find((it) => it.fileId)?.fileId,
};
