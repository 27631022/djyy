import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Download, FileText, Loader2, ZoomIn, ZoomOut } from "lucide-react";
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
import { DocFormatShell, WB_CARD } from "../components/DocFormatShell";
import { UploadPanel } from "../components/UploadPanel";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { useViewTracking } from "../useViewTracking";

/** 排版工作台:左边逐段核对,右边实时预览 */
function Workbench({ initial, onReset }: { initial: AnalyzeResult; onReset: () => void }) {
  const qc = useQueryClient();
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
      // 转换量是后端从审计里数的 —— 刚转完这份要让它即时涨,否则用户看不到自己那一份
      qc.invalidateQueries({ queryKey: ["doc-format", "stats"] });
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
    <div>
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
      <div className={`mb-4 flex flex-wrap gap-x-6 gap-y-1 ${WB_CARD} px-4 py-2 text-xs text-[#667085]`}>
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
        <div className={WB_CARD}>
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
        <div className={WB_CARD}>
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
  const [feedback, setFeedback] = useState(false);
  // 浏览埋点:进页面打一次,离开时 beacon 回填可见时长
  useViewTracking();

  return (
    <DocFormatShell onFeedback={() => setFeedback(true)}>
      {result ? (
        // key 重挂载:换一份文件时工作台状态(改判/缩放/模板)全部重置,不用 effect 同步
        <Workbench key={result.fileId} initial={result} onReset={() => setResult(null)} />
      ) : (
        <UploadPanel onDone={setResult} />
      )}
      {feedback && (
        <FeedbackDialog
          // 已经在转某份文件了 → 反馈时自动带上它,不用再传一遍
          currentFile={result ? { fileId: result.fileId, fileName: result.fileName } : undefined}
          onClose={() => setFeedback(false)}
        />
      )}
    </DocFormatShell>
  );
}
