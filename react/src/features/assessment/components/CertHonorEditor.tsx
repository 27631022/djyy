const INPUT =
  "w-full px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/** 荣誉级别 → 分值 的键(与证书模板 honorLevel 字典 cert_honor_level 对齐;other=未分级/外部证书) */
const LEVEL_KEYS = [
  { key: "company", label: "公司级" },
  { key: "department", label: "部门级" },
  { key: "subsidiary", label: "子公司级" },
  { key: "other", label: "未分级/其他" },
] as const;

/**
 * 荣誉积分(business.certificate.honor)参数编辑器:
 * 年份段(缺省=考核年度)+ 按荣誉级别配分值(缺省每张 1 分 = 计数)。
 * 归集规则(后端):关联用户→行政归属反查;否则按单位路径快照名称匹配;党组织对象经关联行政机构换算。
 */
export function CertHonorEditor({
  sourceParams,
  onChange,
}: {
  sourceParams: Record<string, unknown> | undefined;
  onChange: (sp: Record<string, unknown>) => void;
}) {
  const sp = sourceParams ?? {};
  const yearLabel = typeof sp.yearLabel === "string" ? sp.yearLabel : "";
  const weights = (sp.weights && typeof sp.weights === "object" ? sp.weights : {}) as Record<string, unknown>;

  const patch = (partial: Record<string, unknown>) => onChange({ ...sp, ...partial });
  const setWeight = (key: string, raw: string) => {
    const next: Record<string, unknown> = { ...weights };
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) delete next[key];
    else next[key] = n;
    patch({ weights: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="rounded-lg border border-[#eef2f7] bg-[#FBFBFC] p-3 space-y-2.5">
      <div className="text-[12px] font-medium text-[#4B5563]">荣誉积分取数(证书系统自动)</div>
      <label className="block">
        <span className="text-[11px] text-[#6B7280]">年份段(证书的年份,如 2026;留空 = 考核年度)</span>
        <input
          value={yearLabel}
          onChange={(e) => patch({ yearLabel: e.target.value.trim() || undefined })}
          placeholder="留空 = 考核年度"
          className={INPUT}
        />
      </label>
      <div>
        <div className="text-[11px] text-[#6B7280] mb-1">按荣誉级别积分(留空 = 1 分/张;级别取自证书模板)</div>
        <div className="grid grid-cols-2 gap-2">
          {LEVEL_KEYS.map((l) => (
            <label key={l.key} className="flex items-center gap-1.5 text-[12px] text-[#475467]">
              <span className="w-16 flex-shrink-0">{l.label}</span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={typeof weights[l.key] === "number" ? String(weights[l.key]) : ""}
                onChange={(e) => setWeight(l.key, e.target.value)}
                placeholder="1"
                className={`${INPUT} text-right`}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-[#9CA3AF] leading-relaxed">
        自动统计证书系统里的有效荣誉(撤销的不算):关联了系统用户按其行政归属计入所在单位,未关联的按发证时点选的
        单位路径匹配;录入页该指标为自动取数、不需手工填。
      </div>
    </div>
  );
}
