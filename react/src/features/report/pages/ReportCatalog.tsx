import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadIcon, SearchIcon, PackageIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { reportApi, centsToYuan } from "../api";

/**
 * 报送管理 · 清单(目录)管理 + 检索浏览。
 * 即时搜索(输入即出)+ 多词空格分词 + 类别/推荐单位/产地 筛选(与点选弹窗同款)。导入幂等整体替换。
 */
const PAGE_SIZE = 20;

/** 即时搜索去抖(setState 在 setTimeout 里,异步,合 react-hooks 规则)。 */
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ReportCatalog() {
  const qc = useQueryClient();
  const catalogsQuery = useQuery({ queryKey: ["report", "catalogs"], queryFn: () => reportApi.catalog.listCatalogs() });
  const catalogs = useMemo(() => catalogsQuery.data ?? [], [catalogsQuery.data]);

  const [pickedTag, setPickedTag] = useState<string | null>(null);
  const selectedTag = pickedTag ?? catalogs[0]?.catalogTag ?? null;
  const selected = catalogs.find((c) => c.catalogTag === selectedTag) ?? null;

  // 检索条件(推荐单位/产地不再单列下拉,综合搜索框已覆盖按这两列检索)
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 250);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const facetsQuery = useQuery({
    queryKey: ["report", "catalog-filters", selectedTag],
    queryFn: () => reportApi.catalog.filters(selectedTag!),
    enabled: !!selectedTag,
  });
  const facets = facetsQuery.data;
  const categories = useMemo(() => facets?.categories ?? [], [facets]);

  const searchQuery = useQuery({
    queryKey: ["report", "catalog-search", selectedTag, q, category, page],
    queryFn: () => reportApi.catalog.search({ catalogTag: selectedTag!, q, category, page, pageSize: PAGE_SIZE }),
    enabled: !!selectedTag,
  });
  const items = useMemo(() => searchQuery.data?.items ?? [], [searchQuery.data]);
  const total = searchQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 导入
  const fileRef = useRef<HTMLInputElement>(null);
  const importMut = useMutation({
    mutationFn: (file: File) =>
      reportApi.catalog.import(file, {
        catalogTag: selected?.catalogTag ?? "fupin-2026",
        name: selected?.name ?? "帮扶产品清单",
        year: selected?.year ?? null,
      }),
    onSuccess: (res) => {
      toast.success(`导入成功:${res.count} 条`);
      qc.invalidateQueries({ queryKey: ["report", "catalogs"] });
      qc.invalidateQueries({ queryKey: ["report", "catalog-filters"] });
      qc.invalidateQueries({ queryKey: ["report", "catalog-search"] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "导入失败");
    },
  });

  function pickCatalog(tag: string) {
    setPickedTag(tag);
    setCategory("");
    setQInput("");
    setPage(1);
  }

  return (
    <div className="p-6">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--party-primary)]">报送清单</h1>
          <p className="mt-1 text-sm text-gray-500">
            可点选商品的目录(扶贫帮扶产品清单)。基层填报时点选自动带出名称/分类/产地/价格。一年一调,整体导入。
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importMut.mutate(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {importMut.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
            {selected ? "更新清单(整体替换)" : "导入清单"}
          </button>
        </div>
      </header>

      {/* 清单切换 */}
      {catalogs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {catalogs.map((c) => (
            <button
              key={c.id}
              onClick={() => pickCatalog(c.catalogTag)}
              className={`rounded-full border px-3 py-1 text-sm ${
                c.catalogTag === selectedTag
                  ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {c.name} · {c.itemCount} 项
            </button>
          ))}
        </div>
      )}

      {!selectedTag ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/60 py-20 text-center">
          <PackageIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">暂无清单,点右上角导入 xlsx</p>
        </div>
      ) : (
        <div className="grid grid-cols-[180px_1fr] gap-4">
          {/* 分类分面 */}
          <aside className="space-y-1">
            <button
              onClick={() => {
                setCategory("");
                setPage(1);
              }}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${
                category === "" ? "bg-party-soft font-medium text-[var(--party-primary)]" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              全部 · {selected?.itemCount ?? 0}
            </button>
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  setCategory(c.value);
                  setPage(1);
                }}
                className={`block w-full rounded-md px-3 py-1.5 text-left ${
                  category === c.value ? "bg-party-soft text-[var(--party-primary)]" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="text-sm font-medium">
                  {c.value} · {c.count}
                </span>
                {c.desc && <span className="mt-0.5 block text-[11px] leading-tight text-gray-400">{c.desc}</span>}
              </button>
            ))}
          </aside>

          {/* 检索 + 列表 */}
          <section>
            <div className="mb-3 flex flex-wrap gap-2">
              <div className="relative min-w-[240px] flex-1">
                <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={qInput}
                  onChange={(e) => {
                    setQInput(e.target.value);
                    setPage(1);
                  }}
                  placeholder="综合搜索:名称/规格/推荐单位/产地/类别,空格分词,如「新疆 大米」"
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-8 text-sm focus:border-[var(--party-primary)] focus:outline-none"
                />
                {qInput && (
                  <button
                    onClick={() => {
                      setQInput("");
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">序号</th>
                    <th className="px-3 py-2 font-medium">产品名称</th>
                    <th className="px-3 py-2 font-medium">规格</th>
                    <th className="px-3 py-2 font-medium">分类</th>
                    <th className="px-3 py-2 font-medium">推荐单位</th>
                    <th className="px-3 py-2 font-medium">产地</th>
                    <th className="px-3 py-2 text-right font-medium">采购价(元)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {searchQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                        加载中…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                        无匹配结果
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2 text-gray-400">{it.totalSeq ?? ""}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{it.productName}</td>
                        <td className="px-3 py-2 text-gray-500">{it.spec}</td>
                        <td className="px-3 py-2 text-gray-500">{it.category}</td>
                        <td className="px-3 py-2 text-gray-500">{it.recommendOrg}</td>
                        <td className="px-3 py-2 text-gray-500">{it.origin}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{centsToYuan(it.purchasePriceCents)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
              <span>共 {total} 项</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40"
                >
                  上一页
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
