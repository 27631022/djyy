import { useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import type { FlatOrg } from "./orgFlatten";

const ADMIN = "rgb(26, 107, 200)";
const ADMIN_BG = "rgb(238, 244, 255)";

/**
 * 自定义范围锚点选择(行政机构 / 党组织 两棵树切换)。
 * 党委管理员(party_admin)必须切到「党组织」锚定所在党委;机构管理员锚行政单位。
 * subtree/own 只按行政归属推导,党务数据范围只认这里显式选的党组织锚点(后端 OrgScopeService 同口径)。
 */
export function ScopeOrgSelector({
  allOrgsById, selectedIds, onChange,
}: {
  allOrgsById: Map<string, FlatOrg>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [kind, setKind] = useState<"admin" | "party">(() =>
    selectedIds.some((id) => allOrgsById.get(id)?.kind === "party") ? "party" : "admin",
  );
  const orgs = useMemo(() => {
    const list = Array.from(allOrgsById.values()).filter((o) => o.kind === kind);
    // 跨维已选的锚点也塞进去:仅供 chip 解析名称,下拉里会被 selectedSet 排除
    for (const id of selectedIds) {
      const o = allOrgsById.get(id);
      if (o && o.kind !== kind) list.push(o);
    }
    return list;
  }, [allOrgsById, kind, selectedIds]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {([["admin", "行政机构"], ["party", "党组织"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-2 py-0.5 rounded text-[10px] border ${
              kind === k
                ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft"
                : "border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-[10px] text-[#9CA3AF]">党委管理员请切到「党组织」锚定所在党委</span>
      </div>
      <MultiOrgSelector allOrgs={orgs} selectedIds={selectedIds} onChange={onChange} />
    </div>
  );
}

/**
 * 多组织选择器 (chip 列表 + 下拉添加)。scope=custom 时指定多个组织子树作为并集。
 */
export function MultiOrgSelector({
  allOrgs, selectedIds, onChange,
}: {
  allOrgs: FlatOrg[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const available = allOrgs.filter((o) => !selectedSet.has(o.id));
  const byId = new Map(allOrgs.map((o) => [o.id, o]));

  function add(id: string) {
    if (!id || selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
  }
  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div className="border border-[#E9E9E9] rounded p-2 space-y-2 bg-[#FAFBFC]">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#6B7280] w-14 flex-shrink-0">自定义组织</span>
        <span className="text-[10px] text-[#9CA3AF] flex-1">
          已选 {selectedIds.length} 个 · 多个组织取并集
        </span>
      </div>

      {/* 已选 chips */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const org = byId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: ADMIN_BG, color: ADMIN }}
              >
                {org ? org.name : `(已删除 ${id.slice(0, 6)}…)`}
                <button
                  onClick={() => remove(id)}
                  className="hover:bg-white/40 rounded-full p-px"
                  title="移除"
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-[#D1D5DB] italic">
          尚未选择,从下方下拉添加(至少 1 个)
        </div>
      )}

      {/* 添加下拉 */}
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            add(e.target.value);
            e.target.value = "";
          }}
          className="w-full text-xs px-2 py-1 border border-[#E9E9E9] rounded bg-white"
        >
          <option value="">＋ 添加组织…</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {"  ".repeat(o.depth)}
              {o.isVirtual ? "★ " : ""}
              {o.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
