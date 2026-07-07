import { useRef, useState } from "react";
import { Loader2, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { showcaseErrMsg, showcaseFileUrl } from "../api";
import { UPLOAD_BOX } from "./shared";
import type { ToolDef, ToolEditorProps } from "./types";
import { Caption, ImagePick, PropRow } from "./widgets";

/** 视频:mp4/webm ≤500MB(storage 已放行);播放走公开口(带 HTTP Range,可拖进度) */
export interface VideoContent extends Record<string, unknown> {
  fileId?: string;
  posterFileId?: string;
  caption?: string;
}

function VideoEditor({ value, onChange, upload }: ToolEditorProps<VideoContent>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progressHint, setProgressHint] = useState("");

  const doUpload = async (file: File) => {
    setBusy(true);
    setProgressHint(`正在上传「${file.name}」(${(file.size / 1024 / 1024).toFixed(1)}MB)…`);
    try {
      const r = await upload(file);
      onChange({ ...value, fileId: r.fileId });
    } catch (e) {
      toast.error(showcaseErrMsg(e, "视频上传失败"));
    } finally {
      setBusy(false);
      setProgressHint("");
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void doUpload(f);
        }}
      />
      {value.fileId ? (
        <video
          controls
          preload="metadata"
          className="max-h-[360px] w-full rounded-lg border bg-black"
          src={showcaseFileUrl(value.fileId)}
          poster={value.posterFileId ? showcaseFileUrl(value.posterFileId) : undefined}
        />
      ) : (
        <button
          type="button"
          className={`${UPLOAD_BOX} h-36 w-full text-sm`}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <VideoIcon className="h-6 w-6" />}
          {busy ? progressHint : "点击上传视频(mp4/webm,最大 500MB)"}
        </button>
      )}
      {value.fileId && (
        <button
          type="button"
          className="text-sm text-[var(--party-primary)] hover:underline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? progressHint || "上传中…" : "更换视频"}
        </button>
      )}
      <PropRow label="封面图">
        <ImagePick
          className="h-20 w-32"
          fileId={value.posterFileId}
          upload={upload}
          removable
          label="选填"
          onPick={(fid) => onChange({ ...value, posterFileId: fid })}
        />
      </PropRow>
      <PropRow label="说明">
        <input
          type="text"
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          value={value.caption ?? ""}
          maxLength={300}
          placeholder="视频说明(选填)"
          onChange={(e) => onChange({ ...value, caption: e.target.value || undefined })}
        />
      </PropRow>
    </div>
  );
}

function VideoDisplay({ value }: { value: VideoContent }) {
  if (!value.fileId) return null;
  return (
    <figure>
      <video
        controls
        preload="metadata"
        className="max-h-[480px] w-full rounded-lg border bg-black"
        src={showcaseFileUrl(value.fileId)}
        poster={value.posterFileId ? showcaseFileUrl(value.posterFileId) : undefined}
      />
      <Caption text={value.caption} />
    </figure>
  );
}

export const videoTool: ToolDef<VideoContent> = {
  type: "video",
  label: "视频",
  icon: VideoIcon,
  order: 5,
  description: "上传 mp4/webm 视频(最大 500MB),可配封面图",
  makeDefault: () => ({}),
  Editor: VideoEditor,
  Display: VideoDisplay,
  validate: (v) => (v.fileId ? null : "视频还没上传"),
};
