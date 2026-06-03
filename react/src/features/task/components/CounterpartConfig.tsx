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
import { organizationsApi, type OrgTreeNode } from "@/features/organization";
import { taskApi, taskApiErrorMessage } from "../api";

interface FlatOrg {
  id: string;
  name: string;
  depth: number;
  isVirtual: boolean;
}

function flatten(nodes: OrgTreeNode[], depth = 0, out: FlatOrg[] = []): FlatOrg[] {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth, isVirtual: n.isVirtual });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}
function findNode(nodes: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = n.children?.length ? findNode(n.children, id) : null;
    if (f) return f;
  }
  return null;
}

/** 行政机构单选列表(可限定子树 rootId);受控 selected/onSelect。 */
function OrgPicker({
  rootId,
  selected,
  onSelect,
}: {
  rootId?: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const treeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
  });
  const [kw, setKw] = useState("");
  const tree = treeQuery.data ?? [];
  const scope = rootId ? (findNode(tree, rootId) ? [findNode(tree, rootId)!] : []) : tree;
  const q = kw.trim();
  const list = flatten(scope).filter((o) => !q || o.name.includes(q));

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
          <div className="p-4 text-center text-[12px] text-[#9CA3AF]">没有匹配的部门</div>
        ) : (
          list.map((o) => {
            const active = selected === o.id;
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
                {o.isVirtual && <span className="text-[10px] text-[#9CA3AF]">(虚拟)</span>}
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
      <OrgPicker rootId={unitOrgId} selected={selected} onSelect={setSelected} />
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
      <OrgPicker selected={selected} onSelect={setSelected} />
    </Shell>
  );
}
