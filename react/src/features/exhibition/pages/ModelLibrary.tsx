import { createElement, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BoxIcon,
  EyeIcon,
  Loader2Icon,
  PackageIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import "@google/model-viewer";
import { storageApi } from "@/features/storage";
import { modelLibraryApi, type LibraryModel } from "../api";

/** model-viewer 是 web component;createElement 渲染避开 JSX 自定义元素类型声明(照 Model3dStudio) */
function ModelViewer({ src }: { src: string }) {
  return createElement("model-viewer", {
    src,
    "camera-controls": true,
    "auto-rotate": true,
    "shadow-intensity": "1",
    exposure: "1",
    style: { width: "100%", height: "100%", background: "#f4f4f2", borderRadius: "0.5rem" },
  });
}

function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * 模型库:统一管理可上展台的 3D 模型 —— 手动上传的 .glb/.gltf + 「3D 生成」的 AI 产物。
 * 展厅搭建器的模型台属性里「从模型库选择」即取这里的文件。
 * 预览按需挂载(点「预览」才加载 model-viewer,模型动辄几 MB,不全量拉)。
 */
export default function ModelLibraryPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["exhibition", "model-library"],
    queryFn: () => modelLibraryApi.list(),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => storageApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exhibition", "model-library"] });
      toast.success("已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const models = listQuery.data ?? [];

  async function onUpload(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        await storageApi.upload(f, { ownerModule: "exhibition", folder: "model-library" });
      }
      qc.invalidateQueries({ queryKey: ["exhibition", "model-library"] });
      toast.success(`已上传 ${list.length} 个模型`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
            <BoxIcon className="w-5 h-5 text-[var(--party-primary)]" />
            模型库
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            集中管理可上展台的 3D 模型:手动上传的 .glb / .gltf 与「3D 生成」的 AI 产物。
            布展时在模型台属性里「从模型库选择」即可使用。
          </p>
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          {uploading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
          {uploading ? "上传中…" : "上传模型"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf"
          multiple
          className="hidden"
          onChange={(e) => {
            void onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {listQuery.isLoading ? (
        <div className="text-sm text-[#9CA3AF] py-20 text-center">加载中…</div>
      ) : models.length === 0 ? (
        <div className="border border-dashed border-[#D4D4D4] rounded-xl py-20 text-center text-sm text-[#9CA3AF]">
          还没有模型 —— 点右上「上传模型」,或到「3D 生成」用一张图片生成
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {models.map((m: LibraryModel) => (
            <div key={m.id} className="border border-[#ECECEC] rounded-xl bg-white overflow-hidden flex flex-col">
              <div className="aspect-[4/3] bg-[#F7F7F5] relative">
                {previewId === m.id ? (
                  <ModelViewer src={m.url} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPreviewId(m.id)}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#9CA3AF] hover:text-[var(--party-primary)]"
                  >
                    <PackageIcon className="w-10 h-10" />
                    <span className="flex items-center gap-1 text-xs">
                      <EyeIcon className="w-3.5 h-3.5" />
                      点击预览
                    </span>
                  </button>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col gap-1.5">
                <div className="text-sm font-medium text-[#1A1A1A] truncate" title={m.name}>
                  {m.name}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      m.source === "ai" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {m.source === "ai" ? <SparklesIcon className="w-3 h-3" /> : <UploadIcon className="w-3 h-3" />}
                    {m.source === "ai" ? "AI 生成" : "上传"}
                  </span>
                  <span>{fmtSize(m.size)}</span>
                  <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-auto pt-1.5 flex justify-end">
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[#9CA3AF] hover:text-red-500 hover:bg-red-50"
                    onClick={() => {
                      if (
                        window.confirm(
                          `删除模型「${m.name}」?\n若有展台正在使用该模型,3D 里将显示占位物。`,
                        )
                      ) {
                        removeMut.mutate(m.id);
                      }
                    }}
                  >
                    <Trash2Icon className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
