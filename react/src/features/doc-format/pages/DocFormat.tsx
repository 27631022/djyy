import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileText,
  Loader2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { downloadBlob } from "@/shared/lib/download";
import {
  docFormatApi,
  ELEMENT_TYPE_LABEL,
  ELEMENT_TYPE_OPTIONS,
  ELEMENT_TYPE_TONE,
  type AnalyzeResult,
  type ElementOverride,
  type ElementType,
} from "../api";
import { GridPreview } from "../components/GridPreview";

const PAGE_BG = "min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50";

/** 上传面板 */
function UploadPanel({ onDone }: { onDone: (r: AnalyzeResult) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const analyze = useMutation({
    mutationFn: docFormatApi.analyze,
    onSuccess: onDone,
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "解析失败,请确认是 Word 公文";
      setErr(msg);
    },
  });

  const pick = (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!/\.(doc|docx)$/i.test(f.name)) {
      setErr("只支持 .doc / .docx");
      return;
    }
    analyze.mutate(f);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-800">公文排版</h1>
        <p className="mt-2 text-slate-500">
          上传公文 → 核对结构 → 按规范排好版下载。原文一个字都不会改。
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-16 text-center transition ${
          dragging
            ? "border-[var(--party-primary)] bg-party-soft"
            : "border-slate-300 bg-white/80 hover:border-slate-400"
        }`}
      >
        {analyze.isPending ? (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--party-primary)]" />
            <p className="text-slate-600">正在解析结构…</p>
          </>
        ) : (
          <>
            <Upload className="mx-auto mb-4 h-10 w-10 text-slate-400" />
            <p className="text-lg text-slate-700">把公文拖进来,或点击选择</p>
            <p className="mt-2 text-sm text-slate-400">支持 .doc / .docx</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".doc,.docx"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {err && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>
      )}

      <div className="mt-10 rounded-xl bg-white/70 p-5 text-sm text-slate-500 ring-1 ring-slate-200">
        <p className="mb-2 font-medium text-slate-700">说明</p>
        <ul className="list-inside list-disc space-y-1">
          <li>只排正文。版头(红头)与版记(抄送/印发)不在排版范围,请在 OA 里套红或用现成模板。</li>
          <li>结构靠公文层次序数识别(一、/(一)/1./(1)/第X章/第X条),识别不准的可以在下一步改。</li>
          <li>
            孤行/寡行由 Word 自己避;「孤字」会给出<b className="font-medium text-slate-700">疑似</b>
            提示,请人工核对。
          </li>
        </ul>
      </div>
    </div>
  );
}

/** 排版工作台:左边逐段核对,右边实时预览 */
function Workbench({ initial, onReset }: { initial: AnalyzeResult; onReset: () => void }) {
  const [templateId, setTemplateId] = useState(initial.templateId);
  const [overrides, setOverrides] = useState<Record<number, ElementType>>({});
  const [zoom, setZoom] = useState(0.7);

  const templates = useQuery({
    queryKey: ["doc-format", "templates"],
    queryFn: docFormatApi.listTemplates,
  });

  const overrideList = useMemo<ElementOverride[]>(
    () => Object.entries(overrides).map(([index, type]) => ({ index: Number(index), type })),
    [overrides],
  );
  // 服务端权威:预览、孤字、分页全由后端算,前端不镜像这套算法(杜绝漂移)
  const preview = useQuery({
    queryKey: ["doc-format", "preview", initial.fileId, templateId, overrideList],
    queryFn: () =>
      docFormatApi.preview({ fileId: initial.fileId, templateId, overrides: overrideList }),
    placeholderData: (prev) => prev,
  });

  const data = preview.data ?? initial;
  const cfg = templates.data?.find((t) => t.id === templateId)?.config;
  const orphanSet = useMemo(() => new Set(data.orphans.map((o) => o.index)), [data.orphans]);
  // 预览取数失败时,列表显示的还是上一次(或初始)的类型,而「排版并下载」用的是本地 overrides
  // —— 两者会分叉,用户核对的和下载到的不是一份东西。确认页是唯一质量闸门,分叉了就不许下载。
  const stale = preview.isError;

  const [renderErr, setRenderErr] = useState<string | null>(null);
  const render = useMutation({
    mutationFn: () => {
      setRenderErr(null);
      return docFormatApi.render({ fileId: initial.fileId, templateId, overrides: overrideList });
    },
    onSuccess: async (r) => {
      const blob = await storageApi.fetchBlob(r.fileId);
      downloadBlob(blob, r.fileName);
    },
    // 没有 onError 的话:点了按钮转一圈,什么都不发生、也没有任何提示
    onError: (e: unknown) =>
      setRenderErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "排版失败,请重试;若一直失败请联系管理员",
      ),
  });

  // skip 段也要留在列表里(带删除线),否则用户误选「不排版」后它连同下拉框一起消失,
  // 再没有任何入口改回来 —— 只能重新上传,此前所有人工改判全作废。
  const shown = data.elements;
  const lowCount = shown.filter((e) => e.confidence === "low" && e.type !== "skip").length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      {/* 头 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> 换一份
        </button>
        <div className="flex items-center gap-2 text-slate-800">
          <FileText className="h-5 w-5 text-[var(--party-primary)]" />
          <span className="font-medium">{initial.fileName}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? " (默认)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => render.mutate()}
            disabled={render.isPending || stale}
            title={stale ? "预览没能刷新,请先重试预览再下载" : undefined}
            className="flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {render.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            排版并下载
          </button>
        </div>
      </div>

      {/* 版面摘要 */}
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-white/80 px-4 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
        <span>
          每行 <b className="text-slate-700">{cfg?.grid.charsPerLine ?? "—"}</b> 字
        </span>
        <span>
          每页 <b className="text-slate-700">{data.metrics.linesPerPage}</b> 行
        </span>
        <span>
          行距 <b className="text-slate-700">{cfg?.grid.lineSpacingPt ?? "—"}</b> 磅
        </span>
        <span>
          共 <b className="text-slate-700">{data.pages.length}</b> 页
        </span>
        <span className="text-slate-400">版式示意,最终以 Word/WPS 排版为准</span>
      </div>

      {/* 预览失败 / 排版失败 —— 不能静默 */}
      {stale && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            预览没能刷新,下面显示的结构可能不是最新的 —— 为免下载到与核对不一致的文件,已暂停下载。
          </span>
          <button
            onClick={() => void preview.refetch()}
            className="rounded bg-white px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200"
          >
            重试
          </button>
        </div>
      )}
      {renderErr && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {renderErr}
        </p>
      )}

      {/* 孤字告警 */}
      {data.orphans.length > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            疑似孤字 {data.orphans.length} 处 —— 请人工核对
          </p>
          <ul className="mt-2 space-y-1 text-amber-800">
            {data.orphans.map((o) => (
              <li key={o.index}>
                {o.pageNo ? `第 ${o.pageNo} 页` : "预览中"}
                <span className="mx-1 text-amber-600">·</span>
                末行只剩「<b>{o.tailText}</b>」(该段共 {o.lines} 行)—— 建议增删几个字
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            右侧预览里这些行已<span className="mx-0.5 bg-yellow-300/60 px-1">标黄</span>,照着找即可。
            断行是按网格推算的,与 Word 实际排版可能差一个字;孤行/寡行已交给 Word 自动避免。
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(360px,440px)_1fr]">
        {/* 左:逐段核对 */}
        <div className="rounded-xl bg-white/85 ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              结构核对 · {shown.length} 段
              {lowCount > 0 && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  {lowCount} 段待确认
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              标黄的是规则拿不准的,请核对;改了类型右边预览会跟着变。正文文字不可改。
            </p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {shown.map((el) => {
              const skipped = el.type === "skip";
              return (
                <div
                  key={el.index}
                  className={`mb-1 rounded-lg p-2 ${
                    skipped
                      ? "opacity-60"
                      : el.confidence === "low"
                        ? "bg-amber-50/70 ring-1 ring-amber-200"
                        : "hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <select
                      value={el.type}
                      onChange={(e) =>
                        setOverrides((o) => ({ ...o, [el.index]: e.target.value as ElementType }))
                      }
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${ELEMENT_TYPE_TONE[el.type]}`}
                    >
                      {ELEMENT_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {ELEMENT_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    {orphanSet.has(el.index) && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                        疑似孤字
                      </span>
                    )}
                    {overrides[el.index] !== undefined && (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
                        <Check className="h-3 w-3" /> 已指定
                      </span>
                    )}
                  </div>
                  <p
                    className={`line-clamp-2 text-xs leading-relaxed ${
                      skipped ? "text-slate-400 line-through" : "text-slate-600"
                    }`}
                  >
                    {el.text || <span className="italic">(空段)</span>}
                  </p>
                  {el.note && <p className="mt-0.5 text-[10px] text-amber-700">{el.note}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右:版面预览 */}
        <div className="rounded-xl bg-slate-100/70 ring-1 ring-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
            <p className="text-sm font-medium text-slate-700">版面预览</p>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-200"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-xs text-slate-500">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-200"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto p-6">
            {cfg ? (
              <GridPreview pages={data.pages} config={cfg} metrics={data.metrics} zoom={zoom} />
            ) : (
              <p className="py-20 text-center text-sm text-slate-400">加载模板中…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 公文排版(/doc-format):前台工具,登录即可用 */
export default function DocFormatPage() {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  return (
    <div className={PAGE_BG}>
      {result ? (
        // key 重挂载:换一份文件时工作台状态(改判/缩放/模板)全部重置,不用 effect 同步
        <Workbench key={result.fileId} initial={result} onReset={() => setResult(null)} />
      ) : (
        <UploadPanel onDone={setResult} />
      )}
    </div>
  );
}
