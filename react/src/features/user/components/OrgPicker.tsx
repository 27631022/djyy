/**
 * 组织选择器 popup picker —— 用户管理「行政归属 / 党组织归属」专用。
 *
 * 视觉规范跟 DictPositionPicker 对齐:
 *  - 按钮:显示当前组织简称(用 ★ 标虚拟节点),悬浮 title 显示全路径 + 全称
 *  - 弹窗:顶部搜索(支持中文 / 拼音 / 全称 / code 匹配)
 *    - 无搜索时:树状渲染,可展开收起
 *    - 有搜索时:扁平命中列表,每条带路径 + 全称提示
 *  - 底部:清除选择 + 关闭
 *
 * Props:
 *  - tree: OrgTreeNode[] 顶级节点数组(来自 `organizationsApi.tree`)
 *  - value: 当前选中 orgId(空串=未选)
 *  - onChange: 选中回调,传 orgId(清除时传 '')
 *  - kind: 'admin' | 'party' — 决定主题色(行政蓝 / 党红)
 *  - selectableTypes?: 只允许选中这些 type 的节点(如党组织只让选 ['branch', 'temp_branch'])
 *  - excludeOrgIds?: 已被同用户其他归属占用,标灰禁用
 *  - allowVirtual?: 默认 true,设 false 后虚拟节点不可选
 */

import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { matchesPinyin } from "@/shared/lib/pinyinSearch";
import type { OrgTreeNode } from "@/features/organization";

const COLORS = {
  party: { fg: "var(--party-primary)", bg: "rgb(255, 247, 248)" },
  admin: { fg: "rgb(102, 132, 175)", bg: "rgb(238, 244, 255)" },
} as const;

interface FlatNode {
  id: string;
  name: string;
  fullName: string | null;
  code: string;
  type: string;
  isVirtual: boolean;
  /** 用 / 拼接的全路径,如「昆仑物流 / 公司机关 / 财务部」 */
  path: string;
  /** 祖先 id 数组,用于初始展开 */
  ancestorIds: string[];
}

function flattenForSearch(
  tree: OrgTreeNode[],
  parentPath = "",
  parentAncestors: string[] = [],
): FlatNode[] {
  const out: FlatNode[] = [];
  for (const n of tree) {
    const path = parentPath ? `${parentPath} / ${n.name}` : n.name;
    out.push({
      id: n.id,
      name: n.name,
      fullName: n.fullName,
      code: n.code,
      type: n.type,
      isVirtual: n.isVirtual,
      path,
      ancestorIds: parentAncestors,
    });
    if (n.children?.length) {
      out.push(
        ...flattenForSearch(n.children, path, [...parentAncestors, n.id]),
      );
    }
  }
  return out;
}

export interface OrgPickerProps {
  tree: OrgTreeNode[];
  value: string;
  onChange: (orgId: string) => void;
  title: string;
  kind?: "party" | "admin";
  placeholder?: string;
  /** 按钮宽度的 Tailwind class,默认 "flex-1" */
  width?: string;
  /** 只允许选这些 type 的节点;不传 = 全部可选 */
  selectableTypes?: string[];
  /** 已被同用户其他归属占用 → 标灰 */
  excludeOrgIds?: string[];
  /** 是否允许选虚拟节点,默认 true */
  allowVirtual?: boolean;
}

export function OrgPicker({
  tree,
  value,
  onChange,
  title,
  kind = "admin",
  placeholder = "(选择组织)",
  width = "flex-1",
  selectableTypes,
  excludeOrgIds = [],
  allowVirtual = true,
}: OrgPickerProps) {
  const [open, setOpen] = useState(false);
  const flat = useMemo(() => flattenForSearch(tree), [tree]);
  const current = flat.find((f) => f.id === value);
  const colors = COLORS[kind];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs px-2 py-1 border border-[#E9E9E9] rounded ${width} bg-white text-left truncate hover:border-[var(--party-primary)] transition-colors min-w-0`}
        title={
          current
            ? `${current.path}${current.fullName && current.fullName !== current.name ? `\n全称:${current.fullName}` : ""}`
            : placeholder
        }
      >
        {current ? (
          <span className="text-[#1A1A1A] inline-flex items-center gap-1">
            {current.isVirtual && (
              <span className="text-amber-500" title="虚拟节点">
                ★
              </span>
            )}
            <span className="truncate">{current.name}</span>
          </span>
        ) : (
          <span className="text-[#9CA3AF]">{placeholder}</span>
        )}
      </button>
      {open && (
        <OrgPickerDialog
          tree={tree}
          flat={flat}
          currentValue={value}
          title={title}
          colors={colors}
          selectableTypes={selectableTypes}
          excludeOrgIds={excludeOrgIds}
          allowVirtual={allowVirtual}
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function OrgPickerDialog({
  tree,
  flat,
  currentValue,
  title,
  colors,
  selectableTypes,
  excludeOrgIds,
  allowVirtual,
  onClose,
  onSelect,
}: {
  tree: OrgTreeNode[];
  flat: FlatNode[];
  currentValue: string;
  title: string;
  colors: { fg: string; bg: string };
  selectableTypes?: string[];
  excludeOrgIds: string[];
  allowVirtual: boolean;
  onClose: () => void;
  onSelect: (orgId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    // 顶级默认展开
    tree.forEach((t) => init.add(t.id));
    // 当前 value 的祖先链也展开
    if (currentValue) {
      const me = flat.find((f) => f.id === currentValue);
      if (me) me.ancestorIds.forEach((id) => init.add(id));
    }
    return init;
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isSelectable(node: {
    id: string;
    isVirtual: boolean;
    type: string;
  }): boolean {
    if (excludeOrgIds.includes(node.id) && node.id !== currentValue)
      return false;
    if (!allowVirtual && node.isVirtual) return false;
    if (selectableTypes && !selectableTypes.includes(node.type)) return false;
    return true;
  }

  const searchActive = search.trim().length > 0;
  const matched = useMemo(() => {
    if (!searchActive) return [];
    return flat.filter(
      (f) =>
        matchesPinyin(f.name, search) ||
        (f.fullName && matchesPinyin(f.fullName, search)) ||
        matchesPinyin(f.code, search) ||
        matchesPinyin(f.path, search),
    );
  }, [flat, search, searchActive]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  function renderTreeNode(node: OrgTreeNode, depth: number): React.ReactNode {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expanded.has(node.id);
    const isSelected = node.id === currentValue;
    const selectable = isSelectable(node);
    const reason = (() => {
      if (excludeOrgIds.includes(node.id) && node.id !== currentValue)
        return "已被其他归属占用";
      if (!allowVirtual && node.isVirtual) return "虚拟节点,不可挂靠";
      if (selectableTypes && !selectableTypes.includes(node.type))
        return "类型不允许选";
      return "";
    })();
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 px-2 py-1.5 rounded transition-colors hover:bg-[#F7F8FA]"
          style={{
            backgroundColor: isSelected ? colors.bg : undefined,
            paddingLeft: `${depth * 16 + 8}px`,
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="p-0.5 hover:bg-[#E9E9E9] rounded flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDownIcon className="w-3 h-3" />
              ) : (
                <ChevronRightIcon className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-4 h-4 flex-shrink-0" />
          )}
          <button
            type="button"
            onClick={() => selectable && onSelect(node.id)}
            disabled={!selectable}
            className="flex-1 min-w-0 text-left text-xs flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: isSelected ? colors.fg : "#1A1A1A" }}
            title={reason || node.fullName || undefined}
          >
            {node.isVirtual && <span className="text-amber-500">★</span>}
            <span
              className={`truncate ${isSelected ? "font-semibold" : ""}`}
            >
              {node.name}
            </span>
            {!selectable && reason && (
              <span className="text-[9px] text-[#9CA3AF] flex-shrink-0">
                {reason}
              </span>
            )}
          </button>
        </div>
        {hasChildren &&
          isExpanded &&
          node.children!.map((c) => renderTreeNode(c, depth + 1))}
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl h-[520px] bg-white rounded-xl shadow-2xl pointer-events-auto flex flex-col"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-5 py-3 border-b border-[#E9E9E9] flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#1A1A1A]">{title}</h2>
            <span className="text-[10px] text-[#9CA3AF]">
              共 {flat.length} 个组织
            </span>
            <div className="flex-1" />
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
              <input
                autoFocus
                placeholder="搜索 (名称 / 拼音 / 全称 / code)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-7 py-1.5 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)] w-56"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[#F7F8FA]"
                >
                  <XIcon className="w-3 h-3 text-[#9CA3AF]" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[#F7F8FA]"
            >
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-auto p-2">
            {searchActive ? (
              <SearchResultsView
                matched={matched}
                currentValue={currentValue}
                colors={colors}
                isSelectable={isSelectable}
                onSelect={onSelect}
              />
            ) : (
              <div>{tree.map((t) => renderTreeNode(t, 0))}</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-[#E9E9E9] flex items-center gap-2">
            <span className="text-[10px] text-[#9CA3AF] flex-1 truncate">
              当前:{" "}
              {currentValue ? (
                flat.find((f) => f.id === currentValue)?.path ?? "(未知)"
              ) : (
                <em className="text-[#9CA3AF]">未指定</em>
              )}
            </span>
            <button
              type="button"
              onClick={() => onSelect("")}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              清除选择
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SearchResultsView({
  matched,
  currentValue,
  colors,
  isSelectable,
  onSelect,
}: {
  matched: FlatNode[];
  currentValue: string;
  colors: { fg: string; bg: string };
  isSelectable: (n: { id: string; isVirtual: boolean; type: string }) => boolean;
  onSelect: (orgId: string) => void;
}) {
  if (matched.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-[#9CA3AF]">
        无匹配组织
      </div>
    );
  }
  return (
    <>
      <div className="text-[10px] text-[#9CA3AF] mb-2 px-2">
        搜索命中 {matched.length} 个组织
      </div>
      <div className="space-y-1">
        {matched.map((f) => {
          const isSelected = f.id === currentValue;
          const selectable = isSelectable(f);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => selectable && onSelect(f.id)}
              disabled={!selectable}
              className="w-full text-left px-3 py-2 rounded-md border transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: isSelected ? colors.fg : "#E9E9E9",
                backgroundColor: isSelected ? colors.bg : "white",
              }}
            >
              <div
                className="text-xs font-medium flex items-center gap-1.5"
                style={{ color: isSelected ? colors.fg : "#1A1A1A" }}
              >
                {f.isVirtual && <span className="text-amber-500">★</span>}
                <span className="truncate">{f.name}</span>
                <span className="text-[10px] font-mono text-[#9CA3AF] ml-1 flex-shrink-0">
                  {f.code}
                </span>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">
                {f.path}
              </div>
              {f.fullName && f.fullName !== f.name && (
                <div className="text-[10px] text-[#6B7280] mt-0.5 truncate">
                  {f.fullName}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
