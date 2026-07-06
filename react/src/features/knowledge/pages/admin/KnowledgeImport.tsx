import { memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  FileUpIcon,
  Loader2Icon,
  UploadCloudIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  knowledgeApi,
  knowledgeErrMsg,
  knowledgeImportApi,
  type ImportAnalysis,
  type ImportExecuteItem,
  type ImportResult,
} from "../../api";

type RowState = {
  path: string;
  title: string;
  subCat: string; // 二级子分类名(空=直接进根分类)
  typeCode: string;
  action: "create" | "skip";
  dup: boolean;
  assetsMissing: number;
};

/**
 * 存量 MD 批量导入向导(3 步):上传 zip → 预览核对(根分类/类型/逐行可改)→ 执行 + 结果。
 */
export default function KnowledgeImport() {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  return (
    <div className="p-6 max-w-4xl">
      <button
        type="button"
        onClick={() => navigate("/admin/knowledge")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)] mb-2"
      >
        <ArrowLeftIcon className="w-4 h-4" /> 知识文章管理
      </button>
      <div className="flex items-center gap-2 mb-1">
        <FileUpIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">批量导入(存量 MD)</h1>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        把现有 docsify / Markdown 目录打包成 .zip 上传;按目录结构映射到领域分类,逐条核对后一键入库(导入即发布)。
      </p>

      {result ? (
        <ResultView result={result} onDone={() => navigate("/admin/knowledge")} onAgain={() => { setAnalysis(null); setResult(null); }} />
      ) : analysis ? (
        <PreviewStep analysis={analysis} onBack={() => setAnalysis(null)} onDone={setResult} />
      ) : (
        <UploadStep onAnalyzed={setAnalysis} />
      )}
    </div>
  );
}

function UploadStep({ onAnalyzed }: { onAnalyzed: (a: ImportAnalysis) => void }) {
  const analyze = useMutation({
    mutationFn: (file: File) => knowledgeImportApi.analyze(file),
    onSuccess: onAnalyzed,
    onError: (e) => toast.error(knowledgeErrMsg(e, "解析失败")),
  });

  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <UploadCloudIcon className="w-10 h-10 mx-auto text-gray-300" />
      <div className="mt-3 text-sm text-gray-500">上传 .zip 压缩包(内含 .md 文件,可带子目录与图片)</div>
      <label className="inline-block mt-4">
        <span
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--party-primary)] text-white text-sm cursor-pointer hover:opacity-90 ${
            analyze.isPending ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {analyze.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <FileUpIcon className="w-4 h-4" />}
          {analyze.isPending ? "解析中…" : "选择 zip 文件"}
        </span>
        <input
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) analyze.mutate(f);
          }}
        />
      </label>
      <div className="mt-4 text-xs text-gray-400">
        docsify 的 _sidebar.md / index.html 等空壳文件会自动跳过;图片按相对路径随文入库。
      </div>
    </div>
  );
}

function PreviewStep({
  analysis,
  onBack,
  onDone,
}: {
  analysis: ImportAnalysis;
  onBack: () => void;
  onDone: (r: ImportResult) => void;
}) {
  const cats = useQuery({ queryKey: ["knowledge", "categories"], queryFn: knowledgeApi.listCategories });
  const types = useQuery({ queryKey: ["knowledge", "types"], queryFn: knowledgeApi.listTypes });

  const [rootCat, setRootCat] = useState<string>(""); // 根领域分类 name
  const [rows, setRows] = useState<RowState[]>(() =>
    analysis.items.map((it) => ({
      path: it.path,
      title: it.title,
      subCat: it.dirSegments[0] ?? "",
      typeCode: "",
      action: it.dup ? "skip" : "create",
      dup: it.dup,
      assetsMissing: it.assetsMissing,
    })),
  );
  const [defaultType, setDefaultType] = useState<string>("");

  // 根分类默认取第一个顶级(优先「党建」);默认类型取第一个
  const rootOptions = (cats.data ?? []).map((c) => c.name);
  const effectiveRoot = rootCat || rootOptions.find((n) => n === "党建") || rootOptions[0] || "";
  const typeList = types.data ?? [];
  const effectiveType = defaultType || typeList[0]?.code || "";

  const totalCreate = rows.filter((r) => r.action === "create").length;

  const exec = useMutation({
    mutationFn: () => {
      if (!effectiveRoot) throw new Error("请先选择根领域分类");
      if (!effectiveType) throw new Error("请先在「分类管理」新增内容类型");
      // 只发要导入的行(action=create),items 长度=实际导入数,避免被跳过的行占用后端 1000 条上限
      const items: ImportExecuteItem[] = rows
        .filter((r) => r.action === "create")
        .map((r) => ({
          path: r.path,
          title: r.title.trim().slice(0, 200),
          categoryPath: [effectiveRoot, ...(r.subCat.trim() ? [r.subCat.trim()] : [])],
          typeCode: r.typeCode || effectiveType,
          action: "create" as const,
        }));
      return knowledgeImportApi.execute(analysis.importFileId, items);
    },
    onSuccess: onDone,
    onError: (e) => toast.error(knowledgeErrMsg(e, "导入失败")),
  });

  // 稳定引用,配合 Row 的 memo 让未改动的行跳过重渲(上千篇批次输入不卡)
  const patch = useCallback((i: number, p: Partial<RowState>) => {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }, []);

  return (
    <div className="space-y-4">
      {analysis.sidebarIgnored && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          检测到 _sidebar.md 是无效模板残留(引用的文件都不在包内),已忽略,改按目录结构映射分类。
        </div>
      )}

      {/* 顶部批量设置 */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-end gap-4 flex-wrap">
        <div>
          <div className="text-xs text-gray-400 mb-1">导入到领域分类 *</div>
          <Select value={effectiveRoot} onValueChange={setRootCat}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="选择根分类" />
            </SelectTrigger>
            <SelectContent>
              {rootOptions.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">默认内容类型</div>
          <Select value={effectiveType} onValueChange={setDefaultType}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="类型" />
            </SelectTrigger>
            <SelectContent>
              {typeList.map((t) => (
                <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-gray-400">
          子目录会作为该根分类下的二级分类。共 {rows.length} 篇,将导入 {totalCreate} 篇。
        </div>
      </div>

      {/* 逐条预览表 */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="max-h-[52vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-8">导入</th>
                <th className="text-left font-medium px-3 py-2">标题</th>
                <th className="text-left font-medium px-3 py-2 w-28">二级分类</th>
                <th className="text-left font-medium px-3 py-2 w-28">类型</th>
                <th className="text-left font-medium px-3 py-2 w-24">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <ImportRow
                  key={r.path}
                  row={r}
                  index={i}
                  typeList={typeList}
                  effectiveType={effectiveType}
                  onPatch={patch}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalCreate > 1000 && (
        <div className="text-xs text-amber-600">单批最多导入 1000 篇,请减少勾选或分多次导入(当前勾选 {totalCreate} 篇)。</div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onBack} disabled={exec.isPending}>
          <ArrowLeftIcon className="w-4 h-4 mr-1" /> 重新上传
        </Button>
        <Button
          className="bg-[var(--party-primary)] hover:opacity-90 text-white ml-auto"
          disabled={exec.isPending || totalCreate === 0 || totalCreate > 1000 || !effectiveRoot || !effectiveType}
          onClick={() => exec.mutate()}
        >
          {exec.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <UploadCloudIcon className="w-4 h-4 mr-1" />}
          导入 {totalCreate} 篇
        </Button>
      </div>
    </div>
  );
}

/** 单行(memo:未改动的行跳过重渲,上千篇批次逐字输入不卡) */
const ImportRow = memo(function ImportRow({
  row,
  index,
  typeList,
  effectiveType,
  onPatch,
}: {
  row: RowState;
  index: number;
  typeList: Array<{ code: string; name: string }>;
  effectiveType: string;
  onPatch: (i: number, p: Partial<RowState>) => void;
}) {
  return (
    <tr className={row.action === "skip" ? "opacity-45" : ""}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={row.action === "create"}
          onChange={(e) => onPatch(index, { action: e.target.checked ? "create" : "skip" })}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={row.title}
          maxLength={200}
          onChange={(e) => onPatch(index, { title: e.target.value })}
          className="w-full bg-transparent outline-none focus:bg-gray-50 rounded px-1 py-0.5"
        />
        <div className="text-[11px] text-gray-300 truncate">{row.path}</div>
      </td>
      <td className="px-3 py-2">
        <input
          value={row.subCat}
          maxLength={30}
          onChange={(e) => onPatch(index, { subCat: e.target.value })}
          placeholder="(直接进根分类)"
          className="w-full bg-transparent outline-none focus:bg-gray-50 rounded px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={row.typeCode || effectiveType}
          onChange={(e) => onPatch(index, { typeCode: e.target.value })}
          className="w-full bg-transparent outline-none text-xs border border-gray-200 rounded px-1 py-1"
        >
          {typeList.map((t) => (
            <option key={t.code} value={t.code}>{t.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-[11px]">
        {row.dup && <span className="text-amber-600">标题重复</span>}
        {row.assetsMissing > 0 && <span className="text-gray-400 block">缺 {row.assetsMissing} 图</span>}
      </td>
    </tr>
  );
});

function ResultView({ result, onDone, onAgain }: { result: ImportResult; onDone: () => void; onAgain: () => void }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6">
      <div className="flex items-center gap-2 text-emerald-600">
        <CheckCircle2Icon className="w-6 h-6" />
        <span className="text-lg font-semibold text-gray-900">导入完成</span>
      </div>
      <div className="mt-3 flex gap-6 text-sm">
        <span>成功 <b className="text-emerald-600">{result.created}</b> 篇</span>
        <span>跳过 <b className="text-gray-500">{result.skipped}</b> 篇</span>
        {result.failed > 0 && <span>失败 <b className="text-red-500">{result.failed}</b> 篇</span>}
      </div>
      {result.warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/60 p-3 max-h-56 overflow-y-auto">
          <div className="text-xs font-medium text-amber-700 mb-1">提示({result.warnings.length})</div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <Button className="bg-[var(--party-primary)] hover:opacity-90 text-white" onClick={onDone}>
          去文章管理查看
        </Button>
        <Button variant="outline" onClick={onAgain}>再导一批</Button>
      </div>
    </div>
  );
}
