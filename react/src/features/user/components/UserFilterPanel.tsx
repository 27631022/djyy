/**
 * 用户管理「筛选器」面板:自定义点选筛选 + 检索模板(保存/应用/删除)。
 * 条件模型与模板存取的纯函数在 ./userFilters.ts。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookmarkIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";
import type { RoleListItem } from "@/features/role";
import type { OrgTreeNode } from "@/features/organization";
import { OrgPicker } from "./OrgPicker";
import {
  BUILTIN_TEMPLATES,
  countActiveFilters,
  findOrgNode,
  loadTemplates,
  persistTemplates,
  type FilterTemplate,
  type UserFilters,
} from "./userFilters";

const PARTY = "var(--party-primary)";

function Chip({
  label, active, onClick, color = PARTY, onRemove,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={onClick}
        className="text-xs px-2 py-1 rounded-md border transition-colors"
        style={{
          backgroundColor: active ? `color-mix(in srgb, ${color} 8%, white)` : "white",
          borderColor: active ? color : "#E9E9E9",
          color: active ? color : "#4B5563",
        }}
      >
        {label}
        {onRemove && (
          <XIcon
            className="w-3 h-3 inline ml-1 -mt-px opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          />
        )}
      </button>
    </span>
  );
}

function TriState({
  value, onChange, labels = ["不限", "是", "否"],
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  labels?: string[];
}) {
  const opts: { v: boolean | undefined; label: string }[] = [
    { v: undefined, label: labels[0] },
    { v: true, label: labels[1] },
    { v: false, label: labels[2] },
  ];
  return (
    <div className="inline-flex rounded-md border border-[#E9E9E9] overflow-hidden">
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            className="text-xs px-2.5 py-1 transition-colors border-r border-[#E9E9E9] last:border-r-0"
            style={{
              backgroundColor: on ? PARTY : "white",
              color: on ? "white" : "#4B5563",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium text-[#4B5563] w-20 flex-shrink-0 pt-1.5">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function UserFilterPanel({
  filters, onChange, adminTree, roles, uid,
}: {
  filters: UserFilters;
  onChange: (f: UserFilters) => void;
  adminTree: OrgTreeNode[];
  roles: RoleListItem[];
  /** 当前登录人 id(检索模板按账号存 localStorage) */
  uid: string;
}) {
  const politicalDict = useQuery({
    queryKey: ["dictionary-detail", DICT_CODES.USER_POLITICAL],
    queryFn: () => dictionariesApi.get(DICT_CODES.USER_POLITICAL),
    staleTime: 60_000,
  });
  const politicalOptions = (politicalDict.data?.items ?? []).filter((it) => it.active);

  /* 模板列表:localStorage 渲染期派生;version 只是缓存失效信号(保存/删除后 +1 触发重读) */
  const [tplVersion, setTplVersion] = useState(0);
  const myTemplates = useMemo(() => {
    void tplVersion;
    return loadTemplates(uid);
  }, [uid, tplVersion]);
  const [tplName, setTplName] = useState("");

  const statuses = filters.politicalStatuses ?? [];
  const roleIds = filters.roleIds ?? [];
  const activeCount = countActiveFilters(filters);

  function toggleStatus(code: string) {
    const next = statuses.includes(code) ? statuses.filter((x) => x !== code) : [...statuses, code];
    onChange({ ...filters, politicalStatuses: next.length ? next : undefined });
  }

  function toggleRole(id: string) {
    const next = roleIds.includes(id) ? roleIds.filter((x) => x !== id) : [...roleIds, id];
    onChange({ ...filters, roleIds: next.length ? next : undefined });
  }

  function saveTemplate() {
    const name = tplName.trim();
    if (!name || activeCount === 0) return;
    if (BUILTIN_TEMPLATES.some((t) => t.name === name)) {
      toast.error(`「${name}」是内置模板,请换个名称`);
      return;
    }
    // 同名覆盖(视为更新该模板)
    const rest = myTemplates.filter((t) => t.name !== name);
    const tpl: FilterTemplate = {
      id: `tpl-${Date.now().toString(36)}`,
      name,
      filters: JSON.parse(JSON.stringify(filters)) as UserFilters,
    };
    persistTemplates(uid, [...rest, tpl]);
    setTplVersion((v) => v + 1);
    setTplName("");
  }

  function removeTemplate(id: string) {
    persistTemplates(uid, myTemplates.filter((t) => t.id !== id));
    setTplVersion((v) => v + 1);
  }

  function applyTemplate(tpl: FilterTemplate) {
    onChange(JSON.parse(JSON.stringify(tpl.filters)) as UserFilters);
  }

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-[#E9E9E9] bg-[#FAFBFC] space-y-2.5">
      {/* 检索模板 */}
      <Row label="检索模板">
        {[...BUILTIN_TEMPLATES, ...myTemplates].map((tpl) => (
          <Chip
            key={tpl.id}
            label={tpl.builtin ? `★ ${tpl.name}` : tpl.name}
            active={false}
            onClick={() => applyTemplate(tpl)}
            onRemove={tpl.builtin ? undefined : () => removeTemplate(tpl.id)}
          />
        ))}
        <span className="inline-flex items-center gap-1 ml-2">
          <BookmarkIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <input
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
            placeholder="模板名称"
            className="w-28 px-2 py-1 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)]"
          />
          <button
            type="button"
            onClick={saveTemplate}
            disabled={!tplName.trim() || activeCount === 0}
            title={activeCount === 0 ? "先设置筛选条件再保存" : "把当前筛选条件保存为检索模板"}
            className="text-xs px-2 py-1 rounded-md border border-[#E9E9E9] hover:bg-white disabled:opacity-40"
          >
            保存当前筛选
          </button>
        </span>
      </Row>

      {/* 行政机构 */}
      <Row label="行政机构">
        <OrgPicker
          tree={adminTree}
          value={filters.orgId ?? ""}
          onChange={(orgId) =>
            onChange({
              ...filters,
              orgId: orgId || undefined,
              orgSubtree: orgId ? filters.orgSubtree : undefined,
              // 与「行政未分配」互斥
              noAdminOrg: orgId ? undefined : filters.noAdminOrg,
            })
          }
          title="按行政机构筛选"
          kind="admin"
        />
        <label className="inline-flex items-center gap-1 text-xs text-[#4B5563] select-none">
          <input
            type="checkbox"
            checked={!!filters.orgSubtree}
            disabled={!filters.orgId}
            onChange={(e) => onChange({ ...filters, orgSubtree: e.target.checked || undefined })}
          />
          含下级机构
        </label>
        {/* 模板里存的机构已被删除:OrgPicker 显示成「未选」,但过滤仍生效 → 显式提示可清除 */}
        {filters.orgId && adminTree.length > 0 && !findOrgNode(adminTree, filters.orgId) && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-red-300 bg-red-50 text-red-600">
            所选机构已不存在(过滤仍生效)
            <button
              type="button"
              title="清除该机构条件"
              onClick={() => onChange({ ...filters, orgId: undefined, orgSubtree: undefined })}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </span>
        )}
      </Row>

      {/* 所属机构是否是「部门」 */}
      <Row label="属于部门">
        <TriState
          value={filters.inDept}
          onChange={(v) =>
            onChange({
              ...filters,
              inDept: v,
              // 与「行政未分配」结构性互斥(按机构属性筛 vs 无任何行政归属)
              noAdminOrg: v === undefined ? filters.noAdminOrg : undefined,
            })
          }
        />
        <span className="text-[10px] text-[#9CA3AF]">
          是 = 所属行政机构为职能部门(部门管理人员);否 = 有行政归属但不在任何部门
        </span>
      </Row>

      {/* 政治面貌 */}
      <Row label="政治面貌">
        {politicalOptions.length === 0 ? (
          <span className="text-xs text-[#9CA3AF]">{politicalDict.isLoading ? "加载中…" : "字典未配置"}</span>
        ) : (
          politicalOptions.map((it) => (
            <Chip key={it.code} label={it.label} active={statuses.includes(it.code)} onClick={() => toggleStatus(it.code)} />
          ))
        )}
      </Row>

      {/* 角色 */}
      <Row label="角色">
        {roles.map((r) => (
          <Chip key={r.id} label={r.name} active={roleIds.includes(r.id)} onClick={() => toggleRole(r.id)} />
        ))}
      </Row>

      {/* 部门负责人 */}
      <Row label="部门负责人">
        <TriState value={filters.deptOwner} onChange={(v) => onChange({ ...filters, deptOwner: v })} />
        <span className="text-[10px] text-[#9CA3AF]">= 组织管理里被指定为某行政机构负责人的人</span>
      </Row>

      {/* 在职状态 + 快捷条件 + 清空 */}
      <Row label="在职状态">
        <TriState
          value={filters.active}
          onChange={(v) => onChange({ ...filters, active: v })}
          labels={["不限", "在职", "离职"]}
        />
        <span className="mx-2 h-4 w-px bg-[#E9E9E9]" />
        <Chip
          label="仅党员"
          active={!!filters.hasParty}
          onClick={() =>
            onChange({
              ...filters,
              hasParty: filters.hasParty ? undefined : true,
              noPartyOrg: filters.hasParty ? filters.noPartyOrg : undefined,
            })
          }
        />
        <Chip
          label="行政未分配"
          active={!!filters.noAdminOrg}
          onClick={() =>
            onChange({
              ...filters,
              noAdminOrg: filters.noAdminOrg ? undefined : true,
              orgId: filters.noAdminOrg ? filters.orgId : undefined,
              orgSubtree: filters.noAdminOrg ? filters.orgSubtree : undefined,
              // 与「属于部门」结构性互斥(按机构属性筛 vs 无任何行政归属)
              inDept: filters.noAdminOrg ? filters.inDept : undefined,
            })
          }
        />
        <Chip
          label="党组织未分配"
          active={!!filters.noPartyOrg}
          onClick={() =>
            onChange({
              ...filters,
              noPartyOrg: filters.noPartyOrg ? undefined : true,
              hasParty: filters.noPartyOrg ? filters.hasParty : undefined,
            })
          }
        />
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onChange({})}
          disabled={activeCount === 0}
          className="text-xs px-2 py-1 rounded-md border border-[#E9E9E9] hover:bg-white disabled:opacity-40"
        >
          清空筛选
        </button>
      </Row>
    </div>
  );
}
