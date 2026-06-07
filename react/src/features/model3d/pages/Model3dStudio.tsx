import { createElement, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Box, Sparkles, RefreshCw, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import "@google/model-viewer";
import { storageApi } from "@/features/storage";
import {
  model3dApi,
  model3dErrorMessage,
  resolveModel3dUrl,
  type Model3dTaskStatus,
} from "../api";

/** model-viewer 是 web component;用 createElement 渲染避开 JSX 自定义元素的类型声明。 */
function ModelViewer({ src }: { src: string }) {
  return createElement("model-viewer", {
    src,
    "camera-controls": true,
    "auto-rotate": true,
    "shadow-intensity": "1",
    exposure: "1",
    style: { width: "100%", height: "100%", background: "#0f172a", borderRadius: "0.75rem" },
  });
}

type Phase = "idle" | "creating" | "polling" | "done" | "failed";

/**
 * 3D 生成工作室(3D 展厅的雏形)。
 * 上传图片 → 创建火山 Seed3D 异步任务 → 前端**轮询**(Seed3D 较慢,数分钟)→ 完成转着看 + 下载 .glb。
 */
export default function Model3dStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [arkTaskId, setArkTaskId] = useState<string | null>(null);
  const [result, setResult] = useState<Model3dTaskStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  // 已等秒数(creating / polling 时跑)
  useEffect(() => {
    if (phase !== "creating" && phase !== "polling") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 轮询任务(每 12s)
  useEffect(() => {
    if (phase !== "polling" || !arkTaskId) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await model3dApi.getTask(arkTaskId);
        if (!alive) return;
        if (s.status === "done") {
          setResult(s);
          setPhase("done");
          toast.success("3D 模型生成完成");
        } else if (s.status === "failed") {
          setErrorMsg(s.error ?? "生成失败");
          setPhase("failed");
          toast.error(s.error ?? "生成失败");
        }
      } catch {
        /* 网络抖动,继续轮询 */
      }
    };
    void tick();
    const id = setInterval(tick, 12_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase, arkTaskId]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("请先选择图片");
      const meta = await storageApi.upload(file, { ownerModule: "model3d", folder: "source" });
      return model3dApi.createTask(meta.id, prompt.trim() || undefined);
    },
    onMutate: () => {
      setPhase("creating");
      setResult(null);
      setErrorMsg(null);
      setElapsed(0);
    },
    onSuccess: (r) => {
      setArkTaskId(r.arkTaskId);
      setPhase("polling");
      toast.success("任务已提交,生成中(Seed3D 较慢,约几分钟,保持页面打开)");
    },
    onError: (e) => {
      setPhase("idle");
      toast.error(model3dErrorMessage(e));
    },
  });

  function pick(f: File) {
    if (!f.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    setFile(f);
    setResult(null);
    setPhase("idle");
    setErrorMsg(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(f));
  }

  const busy = phase === "creating" || phase === "polling";
  const glbUrl = result?.url ? resolveModel3dUrl(result.url) : undefined;
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const elapsedText = `${mm}:${ss.toString().padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex items-center gap-2">
        <Box className="h-6 w-6 text-[var(--party-primary)]" />
        <div>
          <h1 className="text-lg font-bold text-slate-800">3D 生成工作室</h1>
          <p className="text-xs text-slate-500">
            上传一张图片,AI(火山 Seed3D)生成带纹理 + PBR 材质的 3D 模型(.glb),供 3D 展厅加载。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* 左:输入 */}
        <div className="space-y-3">
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
            disabled={busy}
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-[var(--party-primary)] disabled:opacity-60"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="原图" className="h-full w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm text-slate-400">
                <Upload className="h-6 w-6" />
                选择图片(物体 / 人物正面,清晰)
              </span>
            )}
          </button>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            disabled={busy}
            placeholder="可选提示词(留空即按图片生成)"
            className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--party-primary)] disabled:bg-slate-50"
          />
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!file || busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--party-primary)] py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            {busy ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {phase === "creating" ? "提交中…" : `生成中… ${elapsedText}(请保持页面打开)`}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {result || phase === "failed" ? "重新生成" : "生成 3D 模型"}
              </>
            )}
          </button>
          {phase === "polling" && (
            <p className="text-[11px] text-slate-400">
              Seed3D 单次约 3-6 分钟,任务已提交火山、即使网络抖动也会继续。生成完会自动出现在右侧。
            </p>
          )}
        </div>

        {/* 右:3D 结果 */}
        <div className="space-y-2">
          <div className="aspect-square w-full overflow-hidden rounded-xl">
            {glbUrl ? (
              <ModelViewer src={glbUrl} />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-xl bg-slate-100 px-4 text-center text-sm text-slate-400">
                {phase === "polling" || phase === "creating" ? (
                  <span className="flex flex-col items-center gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                    生成中… {elapsedText}
                  </span>
                ) : phase === "failed" ? (
                  <span className="flex flex-col items-center gap-2 text-red-500">
                    <AlertCircle className="h-6 w-6" />
                    {errorMsg ?? "生成失败"}
                  </span>
                ) : (
                  "3D 模型预览(生成后可拖动旋转)"
                )}
              </div>
            )}
          </div>
          {phase === "done" && glbUrl && (
            <div className="flex items-center justify-end">
              <a
                href={glbUrl}
                download
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
              >
                <Download className="h-3.5 w-3.5" />
                下载 .glb
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
