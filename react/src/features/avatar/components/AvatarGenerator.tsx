import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Sparkles, Check, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import {
  avatarApi,
  avatarErrorMessage,
  resolveAvatarUrl,
  type AvatarGenerateResult,
} from "../api";
import { AvatarCropDialog } from "./AvatarCropDialog";

const DEFAULT_PROMPT_HINT =
  "3D 仿真人 / 职场 / 纯红底 / 明亮(默认已含:保留本人面部特征、正面免冠、打光明亮)";

/**
 * 头像 AI 生成器(可复用:后台用户管理 + 个人设置都用)。
 * 上传本人照片 →(可选改提示词)→ 生成 → 预览(原图 vs 成图)→「设为头像」回调 onConfirm(url)。
 * 传 targetName/employeeNumber 时:原图与生成头像按「员工编号-姓名」归档,并提供该用户的历史头像库挑选。
 */
export function AvatarGenerator({
  onConfirm,
  confirmLabel = "设为头像",
  targetName,
  employeeNumber,
}: {
  onConfirm: (url: string) => void;
  confirmLabel?: string;
  targetName?: string;
  employeeNumber?: string;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AvatarGenerateResult | null>(null);
  const [cropSrc, setCropSrc] = useState<File | null>(null); // 待裁剪的原始选图(非空 = 裁剪器打开)
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 组件卸载时清理本地预览 object URL
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  // 历史头像库(该用户历次生成,新→旧;有 targetName+employeeNumber 才查)
  const historyQ = useQuery({
    queryKey: ["avatar", "history", employeeNumber],
    queryFn: () => avatarApi.history(targetName, employeeNumber),
    enabled: !!(targetName && employeeNumber),
  });

  // 删历史头像(本人删自己的;管理员可删他人的;在用 → 服务端 409 提示先更换)
  const delMut = useMutation({
    mutationFn: (fileId: string) => avatarApi.removeHistory(fileId),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["avatar", "history", employeeNumber] });
    },
    onError: (e) => toast.error(avatarErrorMessage(e, "删除失败")),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("请先选择照片");
      // 原图按「姓名-原图」存到 avatars/{员工编号}-{姓名} 文件夹(File Station 可浏览归档)
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const folder =
        targetName && employeeNumber ? `avatars/${employeeNumber}-${targetName}` : "avatars";
      const srcName = targetName ? `${targetName}-原图.${ext}` : file.name;
      const srcFile = new File([file], srcName, { type: file.type });
      const meta = await storageApi.upload(srcFile, { ownerModule: "user", folder });
      return avatarApi.generate(meta.id, {
        prompt: prompt.trim() || undefined,
        targetName,
        employeeNumber,
      });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success("生成完成,确认满意后点「" + confirmLabel + "」");
      qc.invalidateQueries({ queryKey: ["avatar", "history", employeeNumber] });
    },
    onError: (e) => toast.error(avatarErrorMessage(e)),
  });

  // 选图(点选/拖拽)先进裁剪器,确认裁剪后才作为上传原图
  function pick(f: File) {
    if (!f.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    setCropSrc(f);
  }

  function applyCropped(f: File) {
    setCropSrc(null);
    setFile(f);
    setResult(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(f));
  }

  const genImg = result ? resolveAvatarUrl(result.url) : undefined;
  const history = historyQ.data ?? [];

  return (
    <div className="space-y-3">
      {/* 1. 选照片 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pick(f);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm transition-colors hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] ${
          dragOver
            ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
            : "border-slate-300 text-slate-500"
        }`}
      >
        <Upload className="h-4 w-4" />
        {dragOver ? "松开鼠标放入照片" : file ? `已选:${file.name}` : "选择或拖入本人照片(正面、清晰)"}
      </button>
      {cropSrc && (
        <AvatarCropDialog
          key={`${cropSrc.name}-${cropSrc.size}-${cropSrc.lastModified}`}
          file={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={applyCropped}
        />
      )}

      {/* 2. 提示词(可选,留空用默认) */}
      <div>
        <div className="mb-1 text-[11px] text-slate-400">
          提示词(留空用默认:3D 仿真人 / 职场 / 纯红底 / 明亮,可自行修改)
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder={DEFAULT_PROMPT_HINT}
          className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--party-primary)]"
        />
      </div>

      {/* 3. 预览:原图 vs 成图 */}
      {(photoPreview || result || genMut.isPending) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="mb-1 text-[11px] text-slate-400">原照片</div>
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="原图"
                className="mx-auto aspect-square w-full max-w-[160px] rounded-lg object-cover"
              />
            ) : (
              <PreviewBox text="—" />
            )}
          </div>
          <div className="text-center">
            <div className="mb-1 text-[11px] text-slate-400">AI 头像</div>
            {genImg ? (
              <img
                src={genImg}
                alt="生成头像"
                className="mx-auto aspect-square w-full max-w-[160px] rounded-lg object-cover ring-2 ring-[var(--party-primary)]"
              />
            ) : genMut.isPending ? (
              <PreviewBox spinning />
            ) : (
              <PreviewBox text="待生成" />
            )}
          </div>
        </div>
      )}

      {/* 4. 操作 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => genMut.mutate()}
          disabled={!file || genMut.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--party-primary)] py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {genMut.isPending ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              生成中…(约 30-60 秒)
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {result ? "重新生成" : "生成头像"}
            </>
          )}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => onConfirm(result.url)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Check className="h-3.5 w-3.5" />
            {confirmLabel}
          </button>
        )}
      </div>

      {/* 5. 历史头像库(点缩略图直接设为头像;右上 ✕ 删除 —— 在用头像服务端会拒删并提示) */}
      {history.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            <History className="h-3 w-3" />
            历史头像库(点选直接设为头像;✕ 删除)
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <div key={h.fileId} className="relative">
                <button
                  type="button"
                  onClick={() => onConfirm(h.url)}
                  title={`${h.originalName} · 点选设为头像`}
                  className="h-14 w-14 overflow-hidden rounded-lg ring-1 ring-slate-200 transition-shadow hover:ring-2 hover:ring-[var(--party-primary)]"
                >
                  <img
                    src={resolveAvatarUrl(h.url)}
                    alt={h.originalName}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  title="删除这张历史头像"
                  disabled={delMut.isPending}
                  onClick={() => {
                    if (window.confirm("删除这张历史头像?删除后不可恢复。")) delMut.mutate(h.fileId);
                  }}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] leading-none text-white hover:bg-red-500 disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewBox({ text, spinning }: { text?: string; spinning?: boolean }) {
  return (
    <div className="mx-auto grid aspect-square w-full max-w-[160px] place-items-center rounded-lg bg-slate-50 text-[11px] text-slate-300">
      {spinning ? <RefreshCw className="h-5 w-5 animate-spin text-slate-300" /> : text}
    </div>
  );
}
