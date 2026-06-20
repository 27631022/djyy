import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageSearchIcon, XIcon } from "lucide-react";
import {
  reportApi,
  centsToYuan,
  CATALOG_BRING_OUT,
  type CatalogPickValue,
  type ReportCatalogItem,
} from "../api";
import type {
  FieldTypeDef,
  FieldPreviewProps,
  FieldPropsEditorProps,
  FieldFillProps,
} from "./types";
import { DESIGNER_CTL, FORM_BOX, PROP_INPUT } from "./shared";
import { PropRow } from "./widgets";
import { CatalogPicker } from "../components/CatalogPicker";

/** 点选清单条目 → 按 bringOut 落快照(productName 始终带出)。 */
function buildSnapshot(item: ReportCatalogItem, bringOut?: string[]): CatalogPickValue {
  const cols = bringOut ?? CATALOG_BRING_OUT.map((c) => c.key);
  const out: CatalogPickValue = { catalogItemId: item.id, productName: item.productName };
  // 完整快照清单信息(年度调整不污染历史):规格/清单供应商/税率/起订量/联系方式始终带上。
  // 注意:清单供应商落 ReportLine.catalogSupplier;明细行的「销售方」是发票识别的实际销售单位(另走发票头)。
  out.spec = item.spec;
  out.supplier = item.supplier;
  out.taxRate = item.taxRate;
  out.minOrderQty = item.minOrderQty;
  out.contact = item.contact;
  if (cols.includes("category")) out.category = item.category;
  if (cols.includes("categoryDesc")) out.categoryDesc = item.categoryDesc;
  if (cols.includes("recommendOrg")) out.recommendOrg = item.recommendOrg;
  if (cols.includes("origin")) out.origin = item.origin;
  if (cols.includes("unitPriceCents")) out.unitPriceCents = item.purchasePriceCents;
  return out;
}

/** 悬停展示「采购库信息」浮卡(fixed 定位,避免被明细表 overflow 裁剪)。 */
function CatalogHoverCard({ item, x, y }: { item: CatalogPickValue; x: number; y: number }) {
  const rows: [string, string | null | undefined][] = [
    ["规格", item.spec],
    [
      "类别",
      item.category ? (item.categoryDesc ? `${item.category} · ${item.categoryDesc}` : item.category) : null,
    ],
    ["供应商", item.supplier],
    ["推荐单位", item.recommendOrg],
    ["产地", item.origin],
    ["采购价", item.unitPriceCents != null ? `¥${centsToYuan(item.unitPriceCents)}` : null],
  ];
  const shown = rows.filter(([, v]) => v);
  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-[#dce4ef] bg-white p-3 text-[12px] shadow-xl"
      style={{ left: x, top: y }}
    >
      <div className="mb-1.5 flex items-center gap-1 font-medium text-[var(--party-primary)]">
        <PackageSearchIcon className="h-3.5 w-3.5" /> 采购库信息
      </div>
      <div className="mb-1.5 text-[13px] font-medium text-[#172033]">{item.productName}</div>
      {shown.length > 0 ? (
        <dl className="space-y-1">
          {shown.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-14 flex-shrink-0 text-[#9CA3AF]">{k}</dt>
              <dd className="text-[#374151]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="text-[#9CA3AF]">(无更多信息)</div>
      )}
      {!item.catalogItemId && (
        <div className="mt-1.5 text-[11px] text-amber-600">未关联采购库,点选可锁定对应商品</div>
      )}
    </div>
  );
}

function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  const brought = (f.bringOut ?? CATALOG_BRING_OUT.map((c) => c.key))
    .map((k) => CATALOG_BRING_OUT.find((c) => c.key === k)?.label)
    .filter(Boolean);
  if (variant === "form")
    return (
      <div className={`${FORM_BOX} flex items-center justify-between`}>
        <span>点选商品</span>
        <span className="text-[12px]">自动带出 ▾</span>
      </div>
    );
  return (
    <div className="space-y-1">
      <div className={`${DESIGNER_CTL} max-w-[300px] flex items-center justify-between text-[#9CA3AF]`}>
        <span>点选目录商品(自动带出)</span>
        <span className="text-[11px]">{f.catalogTag ? "已绑定清单" : "未绑定清单"} ▾</span>
      </div>
      {brought.length > 0 && (
        <div className="text-[11px] text-[#9CA3AF]">带出:产品名称、{brought.join("、")}</div>
      )}
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  const catalogsQuery = useQuery({ queryKey: ["report", "catalogs"], queryFn: () => reportApi.catalog.listCatalogs() });
  const catalogs = useMemo(() => catalogsQuery.data ?? [], [catalogsQuery.data]);
  const bringOut = f.bringOut ?? CATALOG_BRING_OUT.map((c) => c.key);
  const toggle = (key: string) => {
    const set = new Set(bringOut);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    patch({ bringOut: [...set] });
  };
  return (
    <div className="space-y-3">
      <PropRow label="关联清单" hint="点选哪批目录">
        <select
          value={f.catalogTag ?? ""}
          onChange={(e) => patch({ catalogTag: e.target.value || undefined })}
          className={PROP_INPUT}
        >
          <option value="">(未选)</option>
          {catalogs.map((c) => (
            <option key={c.catalogTag} value={c.catalogTag}>
              {c.name}（{c.itemCount} 项）
            </option>
          ))}
        </select>
      </PropRow>
      <PropRow label="点选后带出" hint="产品名称始终带出">
        <div className="flex flex-wrap gap-1.5">
          {CATALOG_BRING_OUT.map((c) => {
            const on = bringOut.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                className={`px-2 py-1 rounded-full text-[12px] border transition-colors ${
                  on
                    ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-bold"
                    : "border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </PropRow>
    </div>
  );
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const picked = value && typeof value === "object" ? (value as CatalogPickValue) : null;

  function showHover() {
    const el = btnRef.current;
    if (!el || !picked) return;
    const r = el.getBoundingClientRect();
    setHover({ x: r.left, y: r.bottom + 4 });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={showHover}
        onMouseLeave={() => setHover(null)}
        className="inline-flex min-w-[200px] max-w-[360px] items-center justify-between gap-2 rounded-md border border-[#dce4ef] bg-white px-3 py-2 text-left text-sm hover:border-[var(--party-primary)]"
      >
        {picked ? (
          <span className="truncate text-[#172033]" title={picked.productName}>
            {picked.productName}
            {picked.unitPriceCents != null && (
              <span className="ml-2 text-[12px] text-[#9CA3AF]">¥{centsToYuan(picked.unitPriceCents)}</span>
            )}
          </span>
        ) : (
          <span className="text-[#9CA3AF]">点选帮扶产品…</span>
        )}
        <PackageSearchIcon className="h-4 w-4 flex-shrink-0 text-[var(--party-primary)]" />
      </button>
      {picked && (
        <button
          type="button"
          title="清除"
          onClick={() => onChange(null)}
          className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
      {picked && hover && <CatalogHoverCard item={picked} x={hover.x} y={hover.y} />}
      <CatalogPicker
        catalogTag={f.catalogTag}
        open={open}
        onClose={() => setOpen(false)}
        onPick={(item) => {
          onChange(buildSnapshot(item, f.bringOut));
          setOpen(false);
        }}
      />
    </div>
  );
}

export const catalogPickField: FieldTypeDef = {
  type: "catalog_pick",
  label: "目录点选",
  icon: PackageSearchIcon,
  order: 10,
  ownProps: ["catalogTag", "bringOut"],
  makeDefaults: () => ({ bringOut: CATALOG_BRING_OUT.map((c) => c.key) }),
  Preview,
  Properties,
  FillInput,
  validate: (f) => (f.catalogTag ? null : "目录点选字段需在右侧选择「关联清单」"),
};
