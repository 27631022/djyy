import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  XIcon,
  Building2Icon,
  Loader2Icon,
  SearchIcon,
  CheckIcon,
  InfoIcon,
} from "lucide-react";
import {
  organizationsApi,
  ORG_TYPE_LABELS,
  ORG_TYPE_COLORS,
  type OrgTreeNode,
  type OrgType,
} from "@/features/organization";
import { taskApi, taskApiErrorMessage } from "../api";

interface FlatOrg {
  id: string;
  name: string;
  depth: number;
  isVirtual: boolean;
  type: string;
  /** 部门标记(单位内部职能部门;对口责任部门只能选它) */
  isDept: boolean;
  /** 有「非虚拟」下级 = 容器单位(如配送中心):未标记部门时作可下钻分组,本身不可选 */
  hasRealChildren: boolean;
}

function flatten(nodes: OrgTreeNode[], depth = 0, out: FlatOrg[] = []): FlatOrg[] {
  for (const n of nodes) {
    const realChildren = (n.children ?? []).filter((c) => !c.isVirtual);
    out.push({
      id: n.id,
      name: n.name,
      depth,
      isVirtual: n.isVirtual,
      type: n.type,
      isDept: n.isDept,
      hasRealChildren: realChildren.length > 0,
    });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

/** 机构小标:层级(蓝)+ 部门徽标(青绿,若已标记部门) */
function TypeTag({ type, isDept }: { type: string; isDept: boolean }) {
  const color = ORG_TYPE_COLORS[type as OrgType] ?? "#9CA3AF";
  const label = ORG_TYPE_LABELS[type as OrgType] ?? type;
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      <span className="text-[10px] px-1 py-px rounded" style={{ backgroundColor: `${color}15`, color }}>
        {label}
      </span>
      {isDept && <span className="text-[10px] px-1 py-px rounded bg-teal-50 text-teal-700">部门</span>}
    </span>
  );
}
function findNode(nodes: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = n.children?.length ? findNode(n.children, id) : null;
    if (f) return f;
  }
  return null;
}

/**
 * 行政机构单选列表。
 * - mode="counterpart"(对口责任部门):从「根单位的下级」开始(不显示根单位本身);
 *   有非虚拟下级的「容器单位(如配送中心)」只作下钻分组、不可选;只有末级部门可选。
 * - mode="dispatch"(派发部门):整棵树,排除虚拟机构。
 */
function OrgPicker({
  rootId,
  mode,
  selected,
  onSelect,
}: {
  rootId?: string;
  mode: "counterpart" | "dispatch";
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const treeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
  });
  const [kw, setKw] = useState("");
  const tree = treeQuery.data ?? [];
  const rootNode = rootId ? findNode(tree, rootId) : null;
  // 对口:根单位的下级(根本身不显示);派发:整棵树
  const scope =
    mode === "counterpart"
      ? rootNode?.children ?? []
      : rootId
        ? rootNode
          ? [rootNode]
          : []
        : tree;
  const q = kw.trim();
  let scoped = flatten(scope);
  if (mode === "counterpart") scoped = scoped.filter((o) => !o.isVirtual); // 隐去虚拟专班/壳
  // 该单位下已标记「部门」→ 只这些可选;否则回退「末级节点可选」(兼容尚未标记的数据)
  const hasAnyDept = mode === "counterpart" && scoped.some((o) => o.isDept);
  const list = scoped.filter((o) => !q || o.name.includes(q));

  const selectableOf = (o: FlatOrg) =>
    mode === "counterpart"
      ? hasAnyDept
        ? o.isDept
        : !o.hasRealChildren
      : !o.isVirtual;

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="搜索部门名"
          className="w-full text-[13px] rounded-md border border-[#dce4ef] pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-party-primary-20"
        />
      </div>
      <div className="max-h-64 overflow-auto rounded-md border border-[#eef1f6] divide-y divide-[#F4F4F4]">
        {treeQuery.isLoading ? (
          <div className="p-4 text-center text-[12px] text-[#9CA3AF]">加载机构树…</div>
        ) : list.length === 0 ? (
          <div className="p-4 text-center text-[12px] text-[#9CA3AF]">
            {mode === "counterpart"
              ? "该单位下还没有部门 —— 请先去「组织机构」给它建承办部门"
              : "没有匹配的部门"}
          </div>
        ) : (
          list.map((o) => {
            const selectable = selectableOf(o);
            const active = selected === o.id;
            if (!selectable) {
              // 容器单位(配送中心等)/ 虚拟:只下钻、不可选
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#9CA3AF] bg-[#FAFBFC]"
                  style={{ paddingLeft: 12 + o.depth * 16 }}
                  title="单位(含下级)—— 请展开选它下面的部门"
                >
                  <Building2Icon className="w-3.5 h-3.5 flex-shrink-0 text-[#C0C6D0]" />
                  <span>{o.name}</span>
                  <TypeTag type={o.type} isDept={o.isDept} />
                  <span className="text-[10px] text-[#C0C6D0] ml-auto">选其部门</span>
                </div>
              );
            }
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#F7F8FA] ${
                  active ? "bg-party-soft" : ""
                }`}
                style={{ paddingLeft: 12 + o.depth * 16 }}
              >
                <Building2Icon
                  className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-[var(--party-primary)]" : "text-[#9CA3AF]"}`}
                />
                <span className={active ? "text-[var(--party-primary)] font-medium" : "text-[#172033]"}>
                  {o.name}
                </span>
                <TypeTag type={o.type} isDept={o.isDept} />
                {active && <CheckIcon className="w-3.5 h-3.5 text-[var(--party-primary)] ml-auto" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Shell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E9E9E9] flex-shrink-0">
          <div className="text-[15px] font-bold text-[#1A1A1A] flex-1">{title}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-auto">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E9E9E9] flex-shrink-0">
          {footer}
        </div>
      </div>
    </div>
  );
}

/** 配置对口:为某未配置单位,在它的子树里选责任部门 → 对口上级设为本任务派发部门。 */
export function ConfigureCounterpartDialog({
  taskId,
  unitOrgId,
  unitName,
  dispatchOrgName,
  onClose,
}: {
  taskId: string;
  unitOrgId: string;
  unitName: string;
  dispatchOrgName: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => taskApi.configureCounterpart(taskId, selected as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["org-tree", "admin"] });
      toast.success("对口已配置,责任部门已生效");
      onClose();
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "配置失败"), { duration: 8000 }),
  });

  return (
    <Shell
      title="配置对口责任部门"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-[13px] font-medium border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
          >
            取消
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!selected || save.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {save.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            确认配置
          </button>
        </>
      }
    >
      <div className="flex items-start gap-1.5 text-[12px] text-[#475467] bg-[#f7f9fc] border border-[#dce4ef] rounded-md px-3 py-2">
        <InfoIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#1A6BC8]" />
        <span>
          在 <b>{unitName}</b> 下选一个承办部门作责任部门,它的「对口上级」会设为本任务派发部门
          <b className="text-[var(--party-primary)]">{dispatchOrgName ? `「${dispatchOrgName}」` : ""}</b>
          。配置后该部门成员即可在「我的待办」接收;同派发部门的后续任务也会自动路由到它。
        </span>
      </div>
      <OrgPicker rootId={unitOrgId} mode="counterpart" selected={selected} onSelect={setSelected} />
    </Shell>
  );
}

/** 设置 / 补派发部门:历史任务没派发部门时,选一个机关部门补上。 */
export function SetDispatchOrgDialog({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => taskApi.setDispatchOrg(taskId, selected as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("派发部门已设置");
      onClose();
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "设置失败"), { duration: 8000 }),
  });

  return (
    <Shell
      title="设置派发部门"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-[13px] font-medium border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
          >
            取消
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!selected || save.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {save.isPending ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            确认
          </button>
        </>
      }
    >
      <div className="flex items-start gap-1.5 text-[12px] text-[#475467] bg-[#f7f9fc] border border-[#dce4ef] rounded-md px-3 py-2">
        <InfoIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#1A6BC8]" />
        <span>
          选择本任务的<b>派发部门(机关部门)</b>,接收单位据此匹配对口责任部门。设置后即可逐个单位配置对口。
        </span>
      </div>
      <OrgPicker mode="dispatch" selected={selected} onSelect={setSelected} />
    </Shell>
  );
}
