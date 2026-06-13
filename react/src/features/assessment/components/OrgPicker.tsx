import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { organizationsApi, type OrgKind, type OrgTreeNode } from "@/features/organization";
import { PROP_INPUT } from "../scoring/shared";

interface FlatOrg {
  id: string;
  name: string;
  depth: number;
}

function flatten(nodes: OrgTreeNode[], depth: number, out: FlatOrg[], deptOnly: boolean) {
  for (const n of nodes) {
    if (!deptOnly || n.isDept) out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out, deptOnly);
  }
}

function findSubtree(nodes: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findSubtree(n.children ?? [], id);
    if (f) return f;
  }
  return null;
}

/**
 * 轻量组织选择器(扁平缩进 select)。
 * deptOnly=true 只列「部门」(责任部门用,不显示单位/虚拟壳);
 * scopeOrgId 限定到该主体单位的子树(责任部门按考核主体层级精确显示)。
 */
export function OrgPicker({
  kind = "admin",
  value,
  onChange,
  placeholder = "未指定",
  deptOnly = false,
  scopeOrgId,
}: {
  kind?: OrgKind;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  deptOnly?: boolean;
  scopeOrgId?: string;
}) {
  const { data } = useQuery({
    queryKey: ["organizations", "tree", kind],
    queryFn: () => organizationsApi.tree(kind),
    staleTime: 60_000,
  });

  const opts = useMemo(() => {
    const roots = scopeOrgId ? (findSubtree(data ?? [], scopeOrgId)?.children ?? []) : (data ?? []);
    const out: FlatOrg[] = [];
    flatten(roots, 0, out, deptOnly);
    return out;
  }, [data, deptOnly, scopeOrgId]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={PROP_INPUT}
    >
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {"　".repeat(o.depth) + o.name}
        </option>
      ))}
    </select>
  );
}
