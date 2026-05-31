import type { OrgTreeNode } from "@/features/organization";

/**
 * 由组织树 + orgId 反查「全称路径」,如「昆仑物流 / 公司机关 / 财务部」。
 * 找不到返回空串。路径分隔符与 OrgPicker 内部一致(" / ")。
 *
 * 发证时把选中组织的路径快照存进 recipientDept —— 即使日后组织改组/改名,
 * 证书上的单位/部门仍是当时的样子(快照语义,跟 recipientName/Dept 一致)。
 */
export function buildOrgPath(tree: OrgTreeNode[], orgId: string): string {
  if (!orgId) return "";
  const walk = (nodes: OrgTreeNode[], trail: string[]): string | null => {
    for (const n of nodes) {
      const next = [...trail, n.name];
      if (n.id === orgId) return next.join(" / ");
      if (n.children?.length) {
        const hit = walk(n.children, next);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(tree, []) ?? "";
}

/**
 * 按名称在组织树里找匹配的单位:先精确(节点名完全相等),再模糊(节点名与查询互相包含)。
 * 用于「先进集体」按集体名兜底匹配所在单位 —— 不精确的命中由调用方标「待核对」。
 * 返回 { orgId, path 全称路径, exact 是否完全相同 },无命中返回 null。
 */
export function findOrgByName(
  tree: OrgTreeNode[],
  rawName: string,
): { orgId: string; path: string; exact: boolean } | null {
  const name = rawName.trim();
  if (!name) return null;
  const flat: { id: string; name: string; path: string }[] = [];
  const walk = (nodes: OrgTreeNode[], trail: string[]) => {
    for (const n of nodes) {
      const next = [...trail, n.name];
      flat.push({ id: n.id, name: n.name, path: next.join(" / ") });
      if (n.children?.length) walk(n.children, next);
    }
  };
  walk(tree, []);
  const exact = flat.find((f) => f.name === name);
  if (exact) return { orgId: exact.id, path: exact.path, exact: true };
  // 模糊:互相包含,取名字最长的(最具体)那个
  const fuzzy = flat
    .filter((f) => f.name.includes(name) || name.includes(f.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (fuzzy) return { orgId: fuzzy.id, path: fuzzy.path, exact: false };
  return null;
}
