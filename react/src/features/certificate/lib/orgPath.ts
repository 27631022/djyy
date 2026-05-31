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
