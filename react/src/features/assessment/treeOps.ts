import type { IndicatorKind, IndicatorNode } from "./api";

/** 指标树纯操作(均返回新树,配合 useHistory 受控)。 */

export function isLeafNode(n: IndicatorNode): boolean {
  return !n.children || n.children.length === 0;
}

export function findNode(tree: IndicatorNode[], code: string): IndicatorNode | null {
  for (const n of tree) {
    if (n.code === code) return n;
    if (n.children) {
      const f = findNode(n.children, code);
      if (f) return f;
    }
  }
  return null;
}

function mapTree(tree: IndicatorNode[], fn: (n: IndicatorNode) => IndicatorNode): IndicatorNode[] {
  return tree.map((n) => {
    const mapped = fn(n);
    if (mapped.children) return { ...mapped, children: mapTree(mapped.children, fn) };
    return mapped;
  });
}

export function updateNode(
  tree: IndicatorNode[],
  code: string,
  patch: Partial<IndicatorNode>,
): IndicatorNode[] {
  return mapTree(tree, (n) => (n.code === code ? { ...n, ...patch } : n));
}

export function removeNode(tree: IndicatorNode[], code: string): IndicatorNode[] {
  return tree
    .filter((n) => n.code !== code)
    .map((n) => (n.children ? { ...n, children: removeNode(n.children, code) } : n));
}

/** 给 parentCode 追加子节点(parentCode=null → 追加为顶层)。父若原是叶子,清掉叶子专属字段变分支。 */
export function addChild(
  tree: IndicatorNode[],
  parentCode: string | null,
  node: IndicatorNode,
): IndicatorNode[] {
  if (parentCode === null) return [...tree, node];
  return tree.map((n) => {
    if (n.code === parentCode) {
      // 子继承父 kind(计权/加分/减分 只在第一层选,下级继承)
      const child = { ...node, kind: n.kind };
      const children = [...(n.children ?? []), child];
      const { dataSource, scoringType, strategyParams, ...rest } = n;
      return { ...rest, children };
    }
    if (n.children) return { ...n, children: addChild(n.children, parentCode, node) };
    return n;
  });
}

/** 同级上移/下移 */
export function moveNode(tree: IndicatorNode[], code: string, dir: -1 | 1): IndicatorNode[] {
  const idx = tree.findIndex((n) => n.code === code);
  if (idx !== -1) {
    const j = idx + dir;
    if (j < 0 || j >= tree.length) return tree;
    const next = [...tree];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  }
  return tree.map((n) => (n.children ? { ...n, children: moveNode(n.children, code, dir) } : n));
}

/** 生成唯一 code(ind_N) */
export function newCode(tree: IndicatorNode[]): string {
  let max = 0;
  const walk = (ns: IndicatorNode[]) => {
    for (const n of ns) {
      const m = /^ind_(\d+)$/.exec(n.code);
      if (m) max = Math.max(max, Number(m[1]));
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return `ind_${max + 1}`;
}

export function makeNode(tree: IndicatorNode[], kind: IndicatorKind = "normal"): IndicatorNode {
  return { code: newCode(tree), label: "新指标", weight: 0, kind };
}

/** 顶层 normal 节点分值之和(权重和提示用) */
export function sumNormalWeights(nodes: IndicatorNode[]): number {
  return nodes.filter((n) => n.kind === "normal").reduce((s, n) => s + (n.weight || 0), 0);
}

/**
 * 重算分支权重。「计权(normal)」与「加分(bonus)」分支 = 子节点之和(只填末端叶子,上级逐级自动累加);
 * 「减分(deduction)」块的 weight = 用户填的「减分上限/封顶」,不覆盖(计分时下级之和按本级上限封顶)。返回新树。
 */
export function recomputeWeights(tree: IndicatorNode[]): IndicatorNode[] {
  return tree.map((n) => {
    if (n.children && n.children.length > 0) {
      const kids = recomputeWeights(n.children);
      if (n.kind === "normal" || n.kind === "bonus") {
        const sum = kids.reduce((s, c) => s + (c.weight || 0), 0);
        return { ...n, children: kids, weight: sum };
      }
      return { ...n, children: kids };
    }
    return n;
  });
}

/** 把某节点及其全部后代的 kind 统一设为 kind(计权/加分/减分 只在第一层选,下级继承)。 */
export function setKindDeep(
  tree: IndicatorNode[],
  code: string,
  kind: IndicatorKind,
): IndicatorNode[] {
  const apply = (n: IndicatorNode): IndicatorNode => ({
    ...n,
    kind,
    children: n.children ? n.children.map(apply) : n.children,
  });
  return tree.map((n) => {
    if (n.code === code) return apply(n);
    if (n.children) return { ...n, children: setKindDeep(n.children, code, kind) };
    return n;
  });
}

/** 同级拖拽重排:把 activeCode 移到 overCode 处(仅当两者同父;跨父不动)。返回新树。 */
export function reorderSiblings(
  tree: IndicatorNode[],
  activeCode: string,
  overCode: string,
): IndicatorNode[] {
  const a = tree.findIndex((n) => n.code === activeCode);
  const o = tree.findIndex((n) => n.code === overCode);
  if (a !== -1 && o !== -1) {
    const next = [...tree];
    const [moved] = next.splice(a, 1);
    next.splice(o, 0, moved);
    return next;
  }
  return tree.map((n) =>
    n.children ? { ...n, children: reorderSiblings(n.children, activeCode, overCode) } : n,
  );
}
