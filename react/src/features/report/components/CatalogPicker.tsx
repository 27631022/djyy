import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, XIcon } from "lucide-react";
import { reportApi, centsToYuan, type ReportCatalogItem } from "../api";

/**
 * 清单点选弹窗 —— 即时搜索(输入即出结果,无需点搜索)+ 多词空格分词(如「新疆 大米」)
 * + 类别/推荐单位/产地 点选栏目 + 分页。供 catalog_pick 字段的 FillInput 复用。
 */
const PAGE_SIZE = 12;

/** 即时搜索去抖(setState 在 setTimeout 里,异步,合 react-hooks 规则)。 */
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CatalogPicker({
  catalogTag,
  open,
  onClose,
  onPick,
}: {
  catalogTag: string | undefined;
  open: boolean;
  onClose: () => void;
  onPick: (item: ReportCatalogItem) => void;
}) {
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 250);
  const [category, setCategory] = useState("");
  const [recommendOrg, setRecommendOrg] = useState("");
  const [origin, setOrigin] = useState("");
  const [page, setPage] = useState(1);

  const enabled = open && !!catalogTag;
  const facetsQuery = useQuery({
    queryKey: ["report", "catalog-filters", catalogTag],
    queryFn: () => reportApi.catalog.filters(catalogTag!),
    enabled,
  });
  const facets = facetsQuery.data;
  const categories = useMemo(() => facets?.categories ?? [], [facets]);

  const searchQuery = useQuery({
    queryKey: ["report", "catalog-search", catalogTag, q, category, recommendOrg, origin, page],
    queryFn: () =>
      reportApi.catalog.search({ catalogTag: catalogTag!, q, category, recommendOrg, origin, page, pageSize: PAGE_SIZE }),
    enabled,
  });
  const items = useMemo(() => searchQuery.data?.items ?? [], [searchQuery.data]);
  const total = searchQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!open) return null;

  const selectCls =
    "rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none max-w-[160px]";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-800">选择帮扶产品</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        {!catalogTag ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">该字段未绑定清单(请在设计器右栏选择关联清单)</div>
        ) : (
          <>
            {/* 即时搜索 */}
            <div className="px-4 pt-3">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={qInput}
                  autoFocus
                  onChange={(e) => {
                    setQInput(e.target.value);
                    setPage(1);
                  }}
                  placeholder="输入即搜;空格分词多列匹配,如「新疆 大米」"
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

            {/* 点选栏目:推荐单位 / 产地(可输入筛选,选建议或打部分字都行) */}
            <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
              <input
                list="rp-rec-orgs"
                value={recommendOrg}
                onChange={(e) => {
                  setRecommendOrg(e.target.value);
                  setPage(1);
                }}
                placeholder="推荐单位…"
                className={selectCls}
              />
              <datalist id="rp-rec-orgs">
                {(facets?.recommendOrgs ?? []).map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.count} 项
                  </option>
                ))}
              </datalist>
              <input
                list="rp-origins"
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setPage(1);
                }}
                placeholder="产地…"
                className={selectCls}
              />
              <datalist id="rp-origins">
                {(facets?.origins ?? []).map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.count} 项
                  </option>
                ))}
              </datalist>
              {(recommendOrg || origin || category || qInput) && (
                <button
                  onClick={() => {
                    setQInput("");
                    setCategory("");
                    setRecommendOrg("");
                    setOrigin("");
                    setPage(1);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  清空筛选
                </button>
              )}
            </div>

            {/* 类别 chips */}
            <div className="flex flex-wrap gap-1.5 px-4 pt-2">
              <button
                onClick={() => {
                  setCategory("");
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  category === "" ? "bg-party-soft font-medium text-[var(--party-primary)]" : "bg-gray-100 text-gray-600"
                }`}
              >
                全部类别
              </button>
              {categories.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setCategory(c.value);
                    setPage(1);
                  }}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    category === c.value ? "bg-party-soft font-medium text-[var(--party-primary)]" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {c.value} · {c.count}
                </button>
              ))}
            </div>

            <div className="mt-2 flex-1 overflow-y-auto px-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-gray-400">
                  <tr>
                    <th className="py-1.5 font-medium">产品名称</th>
                    <th className="py-1.5 font-medium">规格</th>
                    <th className="py-1.5 font-medium">推荐单位</th>
                    <th className="py-1.5 font-medium">产地</th>
                    <th className="py-1.5 text-right font-medium">采购价(元)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {searchQuery.isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        加载中…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        无匹配结果
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id} onClick={() => onPick(it)} className="cursor-pointer hover:bg-party-soft">
                        <td className="py-2 font-medium text-gray-800">{it.productName}</td>
                        <td className="py-2 text-gray-500">{it.spec}</td>
                        <td className="py-2 text-gray-500">{it.recommendOrg}</td>
                        <td className="py-2 text-gray-500">{it.origin}</td>
                        <td className="py-2 text-right text-gray-700">{centsToYuan(it.purchasePriceCents)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <footer className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-sm text-gray-500">
              <span>共 {total} 项,点行即选</span>
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
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
