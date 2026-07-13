import type { OrgTreeNode } from "@/features/organization";

/* 组织树扁平项(下拉/锚点选择用)。纯函数与类型独立于组件文件,
   避免 react-refresh/only-export-components 警告(同 shadcn vendor / task fields 惯例)。 */
export interface FlatOrg {
  id: string;
  name: string;
  code: string;
  kind: "party" | "admin";
  type: string;
  isVirtual: boolean;
  depth: number;
  path: string; // "集团/部门/小组"
}

/** 组织树 → 扁平数组(带缩进 depth 与全称 path) */
export function flattenTree(tree: OrgTreeNode[], depth = 0, parentPath = ""): FlatOrg[] {
  const out: FlatOrg[] = [];
  for (const node of tree) {
    const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
    out.push({
      id: node.id,
      name: node.name,
      code: node.code,
      kind: node.kind,
      type: node.type,
      isVirtual: node.isVirtual,
      depth,
      path,
    });
    if (node.children?.length) out.push(...flattenTree(node.children, depth + 1, path));
  }
  return out;
}

/** admin + party 两棵树扁平合并成 id→FlatOrg 索引(scope=custom 锚点解析用) */
export function buildOrgIndex(adminTree: OrgTreeNode[], partyTree: OrgTreeNode[]): Map<string, FlatOrg> {
  const map = new Map<string, FlatOrg>();
  for (const o of [...flattenTree(adminTree), ...flattenTree(partyTree)]) map.set(o.id, o);
  return map;
}
