import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gamepad2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { interactiveFileUrl } from "../../api";
import { designApi, type GameDesignRow } from "../designApi";
import { parseDesign } from "../designTypes";

const DESIGNS_KEY = ["interactive", "designs"];

/**
 * 自制游戏库:互动游戏编辑器的产物列表。新建 = 先建行拿 id(素材 folder=design-<id>,
 * showcase ensureId 范式)再进编辑器;设计好的游戏在「互动活动」节目单里一键添加。
 */
export default function DesignListPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: DESIGNS_KEY, queryFn: designApi.list });
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const createMut = useMutation({
    mutationFn: (name: string) => designApi.create(name),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: DESIGNS_KEY });
      nav(`/admin/interactive/designer/${row.id}`);
    },
    onError: () => toast.error("新建失败"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => designApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESIGNS_KEY });
      toast.success("已删除(已添加到活动的节目不受影响)");
    },
    onError: () => toast.error("删除失败"),
  });
  const renameMut = useMutation({
    mutationFn: (input: { id: string; name: string }) => designApi.update(input.id, { name: input.name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DESIGNS_KEY }),
    onError: () => toast.error("改名失败"),
  });

  const designs = query.data ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gamepad2Icon className="w-5 h-5" style={{ color: "var(--party-primary)" }} />
            自制游戏库
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            用编辑器制作「闯关赛」互动游戏:上传背景、勾画行进路线、设答题/找错关卡 —— 设计一次,任意活动可添加
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md px-4 py-2 text-white text-sm font-semibold flex items-center gap-1"
          style={{ background: "var(--party-primary)" }}
        >
          <PlusIcon className="w-4 h-4" />
          新建游戏
        </button>
      </div>

      {creating && (
        <div className="rounded-lg border border-[var(--party-primary)] bg-party-soft p-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) createMut.mutate(newName.trim());
              if (e.key === "Escape") setCreating(false);
            }}
            maxLength={60}
            placeholder="游戏名称,如:党史知识闯关赛"
            autoFocus
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => newName.trim() && createMut.mutate(newName.trim())}
            disabled={createMut.isPending || !newName.trim()}
            className="rounded-md px-4 py-1.5 text-white text-sm disabled:opacity-50"
            style={{ background: "var(--party-primary)" }}
          >
            {createMut.isPending ? "创建中…" : "创建并进入编辑器"}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-md border border-gray-300 px-4 py-1.5 text-sm">
            取消
          </button>
        </div>
      )}

      {query.isLoading ? (
        <div className="text-center text-gray-400 py-16">加载中…</div>
      ) : designs.length === 0 ? (
        <div className="text-center text-gray-400 py-16 rounded-lg border border-dashed border-gray-300">
          还没有自制游戏 —— 点右上「新建游戏」开始设计
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map((d) => (
            <DesignCard key={d.id} row={d} onRemove={() => removeMut.mutate(d.id)} onRename={(name) => renameMut.mutate({ id: d.id, name })} />
          ))}
        </div>
      )}
    </div>
  );
}

function DesignCard({ row, onRemove, onRename }: { row: GameDesignRow; onRemove: () => void; onRename: (name: string) => void }) {
  const design = parseDesign(row.configJson);
  const cover = design.board.backgroundFileId ? interactiveFileUrl(design.board.backgroundFileId) : null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow">
      <Link to={`/admin/interactive/designer/${row.id}`} className="block relative h-36 bg-[#20242e]">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">未上传背景</div>
        )}
        <div className="absolute bottom-1.5 left-2 flex gap-1.5">
          <span className="rounded bg-black/55 px-1.5 py-0.5 text-white text-[11px]">路线 {design.board.route.length} 点</span>
          <span className="rounded bg-black/55 px-1.5 py-0.5 text-white text-[11px]">关卡 {design.board.checkpoints.length}</span>
          <span className="rounded bg-black/55 px-1.5 py-0.5 text-white text-[11px]">{design.durationSec}s</span>
        </div>
      </Link>
      <div className="p-3 space-y-1.5">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onRename(name.trim());
                  setEditing(false);
                }
                if (e.key === "Escape") {
                  setName(row.name);
                  setEditing(false);
                }
              }}
              maxLength={60}
              autoFocus
              className="flex-1 rounded border border-gray-300 px-2 py-0.5 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                if (name.trim()) onRename(name.trim());
                setEditing(false);
              }}
              className="text-xs text-[var(--party-primary)]"
            >
              保存
            </button>
          </div>
        ) : (
          <div className="font-semibold truncate" title={row.name}>
            {row.name}
          </div>
        )}
        <div className="text-[11px] text-gray-400">
          {row.createdByName} · 更新于 {new Date(row.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="flex items-center gap-3 text-sm pt-0.5">
          <Link to={`/admin/interactive/designer/${row.id}`} className="text-[var(--party-primary)] hover:underline">
            编辑
          </Link>
          <button type="button" onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-800">
            改名
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`删除自制游戏「${row.name}」?已添加到活动的节目不受影响。`)) onRemove();
            }}
            className="text-gray-400 hover:text-red-500 ml-auto"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
