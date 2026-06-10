import { useState } from "react";
import { XIcon, SearchIcon, CheckIcon, Building2Icon, MapPinIcon, UsersIcon } from "lucide-react";
import type { MeetingRoomListItem } from "../api";

/**
 * 会场(会议室)点选器:搜索(名称/地点)+ 容纳下限筛选 + 列表点选。
 * 参考「机构/岗位」的点选搜索弹窗。会议室来源 = roomApi.list(由父传入)。
 * 预留:将来打通会议室管理后,这里可换成跨系统查询;座次图「谁建谁见」权限后续做。
 */
export function RoomPicker({
  rooms,
  value,
  onSelect,
  onClose,
}: {
  rooms: MeetingRoomListItem[];
  value?: string;
  onSelect: (roomId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [minCap, setMinCap] = useState(0);
  const filtered = rooms.filter(
    (r) =>
      (!q || r.name.includes(q) || (r.location || "").includes(q)) &&
      (!minCap || r.capacity >= minCap),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E9E9E9]">
          <h2 className="text-base font-bold text-[#1A1A1A]">选择会场</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 flex items-center gap-2 border-b border-[#F0F0F0]">
          <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E9E9E9] focus-within:border-[var(--party-primary)]">
            <SearchIcon className="w-4 h-4 text-[#9CA3AF]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜会议室名 / 地点"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E9E9E9]">
            <span className="text-xs text-[#9CA3AF]">容纳≥</span>
            <input
              type="number"
              min={0}
              value={minCap || ""}
              onChange={(e) => setMinCap(Math.max(0, Number(e.target.value) || 0))}
              placeholder="人数"
              className="w-16 text-sm outline-none bg-transparent"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-1.5">
          {filtered.length === 0 && (
            <div className="text-sm text-[#9CA3AF] text-center py-8">没有匹配的会议室</div>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect(r.id);
                onClose();
              }}
              className={`w-full text-left rounded-lg border p-3 flex items-center gap-3 transition-colors ${
                value === r.id
                  ? "border-[var(--party-primary)] bg-party-soft"
                  : "border-[#E9E9E9] hover:border-[var(--party-primary)]"
              }`}
            >
              <Building2Icon className="w-5 h-5 text-[var(--party-primary)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#1A1A1A] truncate">{r.name}</div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[#9CA3AF]">
                  {r.location && (
                    <span className="flex items-center gap-0.5">
                      <MapPinIcon className="w-3 h-3" />
                      {r.location}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <UsersIcon className="w-3 h-3" />
                    容纳 {r.capacity}
                  </span>
                  <span>{r.layoutCount} 张座次图</span>
                </div>
              </div>
              {value === r.id && <CheckIcon className="w-4 h-4 text-[var(--party-primary)] flex-shrink-0" />}
            </button>
          ))}
        </div>
        <div className="px-5 py-2 border-t border-[#F0F0F0] text-[10px] text-[#9CA3AF]">
          点会议室即选定;下一步在该会场里选座次图。(打通会议室管理 / 座次图权限后续)
        </div>
      </div>
    </div>
  );
}
