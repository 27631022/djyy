import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PlusIcon,
  BuildingIcon,
  MapPinIcon,
  UsersIcon,
  PencilIcon,
  Trash2Icon,
  LayoutGridIcon,
  ArmchairIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  roomApi,
  layoutApi,
  type MeetingRoomListItem,
  type VenueLayoutListItem,
} from "../api";

const PARTY = "var(--party-primary)";

const FACILITY_PRESETS = ["视频会议", "音响系统", "投屏", "同声传译", "录播", "无线话筒", "空调", "茶水"];

export default function RoomList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const roomsQuery = useQuery({ queryKey: ["venue", "rooms"], queryFn: () => roomApi.list() });

  const [roomModal, setRoomModal] = useState<{ mode: "create" } | { mode: "edit"; room: MeetingRoomListItem } | null>(null);
  const [layoutModalRoomId, setLayoutModalRoomId] = useState<string | null>(null);

  const deleteRoomMut = useMutation({
    mutationFn: (id: string) => roomApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "rooms"] });
      toast.success("会议室已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const rooms = roomsQuery.data ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
            <BuildingIcon className="w-5 h-5" style={{ color: PARTY }} />
            会议室管理
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-0.5">实体会议室与会场图。一个会议室可有多张会场图。</p>
        </div>
        <button
          onClick={() => setRoomModal({ mode: "create" })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-4 h-4" />
          新建会议室
        </button>
      </div>

      {roomsQuery.isLoading && <div className="text-sm text-[#9CA3AF]">加载中…</div>}
      {!roomsQuery.isLoading && rooms.length === 0 && (
        <div className="border border-dashed border-[#E9E9E9] rounded-xl p-12 text-center text-[#9CA3AF]">
          <BuildingIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          还没有会议室。点右上角「新建会议室」开始。
        </div>
      )}

      <div className="space-y-5">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            onEdit={() => setRoomModal({ mode: "edit", room })}
            onDelete={() => {
              if (confirm(`删除会议室「${room.name}」?其下所有会场图也会一并删除。`)) {
                deleteRoomMut.mutate(room.id);
              }
            }}
            onNewLayout={() => setLayoutModalRoomId(room.id)}
            onOpenLayout={(id) => navigate(`/admin/venue/layouts/${id}`)}
          />
        ))}
      </div>

      {roomModal && (
        <RoomModal
          initial={roomModal.mode === "edit" ? roomModal.room : undefined}
          onClose={() => setRoomModal(null)}
          onSaved={() => {
            setRoomModal(null);
            qc.invalidateQueries({ queryKey: ["venue", "rooms"] });
          }}
        />
      )}

      {layoutModalRoomId && (
        <NewLayoutModal
          roomId={layoutModalRoomId}
          onClose={() => setLayoutModalRoomId(null)}
          onCreated={(id) => {
            setLayoutModalRoomId(null);
            qc.invalidateQueries({ queryKey: ["venue", "rooms"] });
            navigate(`/admin/venue/layouts/${id}`);
          }}
        />
      )}
    </div>
  );
}

/* ─── 会议室卡片(含会场图列表) ─── */

function RoomCard({
  room,
  onEdit,
  onDelete,
  onNewLayout,
  onOpenLayout,
}: {
  room: MeetingRoomListItem;
  onEdit: () => void;
  onDelete: () => void;
  onNewLayout: () => void;
  onOpenLayout: (id: string) => void;
}) {
  const qc = useQueryClient();
  const layoutsQuery = useQuery({
    queryKey: ["venue", "layouts", room.id],
    queryFn: () => layoutApi.list(room.id),
  });
  const deleteLayoutMut = useMutation({
    mutationFn: (id: string) => layoutApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "layouts", room.id] });
      qc.invalidateQueries({ queryKey: ["venue", "rooms"] });
      toast.success("会场图已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });
  const layouts = layoutsQuery.data ?? [];

  return (
    <div className="bg-white border border-[#E9E9E9] rounded-xl overflow-hidden">
      <div className="flex items-start justify-between px-4 py-3 border-b border-[#F0F0F0]">
        <div className="min-w-0">
          <div className="font-semibold text-[#1A1A1A] truncate">{room.name}</div>
          <div className="flex items-center gap-3 mt-1 text-xs text-[#9CA3AF]">
            {room.location && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="w-3.5 h-3.5" />
                {room.location}
              </span>
            )}
            {room.capacity > 0 && (
              <span className="flex items-center gap-1">
                <UsersIcon className="w-3.5 h-3.5" />
                容量 {room.capacity}
              </span>
            )}
            <span className="flex items-center gap-1">
              <LayoutGridIcon className="w-3.5 h-3.5" />
              {room.layoutCount} 张会场图
            </span>
          </div>
          {room.description && <div className="mt-1 text-xs text-[#9CA3AF] line-clamp-1">{room.description}</div>}
          {room.facilities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {room.facilities.map((f) => (
                <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-party-soft text-[var(--party-primary)]">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]" title="编辑会议室">
            <PencilIcon className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#EF4444]" title="删除会议室">
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {layouts.map((l) => (
          <LayoutTile
            key={l.id}
            layout={l}
            onOpen={() => onOpenLayout(l.id)}
            onDelete={() => {
              if (confirm(`删除会场图「${l.name}」?`)) deleteLayoutMut.mutate(l.id);
            }}
          />
        ))}
        <button
          onClick={onNewLayout}
          className="aspect-[3/2] rounded-lg border-2 border-dashed border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-party-soft flex flex-col items-center justify-center gap-1 text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors"
        >
          <PlusIcon className="w-6 h-6" />
          <span className="text-xs font-medium">新建会场图</span>
        </button>
      </div>
    </div>
  );
}

function LayoutTile({
  layout,
  onOpen,
  onDelete,
}: {
  layout: VenueLayoutListItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-lg border border-[#E9E9E9] overflow-hidden hover:border-[var(--party-primary)] transition-colors">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="aspect-[3/2] bg-[#F7F8FA] flex items-center justify-center overflow-hidden">
          {layout.thumbnail ? (
            <img src={layout.thumbnail} alt={layout.name} className="w-full h-full object-contain" />
          ) : (
            <LayoutGridIcon className="w-8 h-8 text-[#D1D5DB]" />
          )}
        </div>
        <div className="px-2 py-1.5">
          <div className="text-xs font-medium text-[#1A1A1A] truncate">{layout.name}</div>
          <div className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
            <ArmchairIcon className="w-3 h-3" />
            {layout.seatCount} 座
          </div>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 p-1 rounded bg-white/90 text-[#EF4444] opacity-0 group-hover:opacity-100 hover:bg-white shadow-sm"
        title="删除会场图"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── 会议室 新建/编辑 弹窗 ─── */

function RoomModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: MeetingRoomListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ?? 0);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [facilities, setFacilities] = useState<string[]>(initial?.facilities ?? []);
  const [customFacility, setCustomFacility] = useState("");

  function toggleFacility(f: string) {
    setFacilities((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }
  function addCustomFacility() {
    const f = customFacility.trim();
    if (f && !facilities.includes(f)) setFacilities((prev) => [...prev, f]);
    setCustomFacility("");
  }

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        location: location.trim() || undefined,
        capacity: Number.isFinite(capacity) ? capacity : 0,
        description: description.trim() || undefined,
        facilities,
      };
      return initial ? roomApi.update(initial.id, payload) : roomApi.create(payload);
    },
    onSuccess: () => {
      toast.success(initial ? "已保存" : "已创建");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  return (
    <Modal title={initial ? "编辑会议室" : "新建会议室"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="名称 *">
          <input value={name} onChange={(e) => setName(e.target.value)} className={MODAL_INPUT} placeholder="如:综合楼三楼大会议室" autoFocus />
        </Field>
        <Field label="位置">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={MODAL_INPUT} placeholder="楼栋 / 楼层 / 房间号" />
        </Field>
        <Field label="容量(人)">
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 0)}
            className={MODAL_INPUT}
          />
        </Field>
        <Field label="备注">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${MODAL_INPUT} resize-none`} />
        </Field>
        <Field label="硬件设施">
          <div className="flex flex-wrap gap-1.5">
            {FACILITY_PRESETS.map((f) => {
              const on = facilities.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFacility(f)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? "text-white border-transparent" : "text-[#6B7280] border-[#E9E9E9] hover:bg-[#F7F8FA]"}`}
                  style={on ? { backgroundColor: PARTY } : undefined}
                >
                  {f}
                </button>
              );
            })}
            {facilities
              .filter((f) => !FACILITY_PRESETS.includes(f))
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFacility(f)}
                  className="px-2.5 py-1 rounded-full text-xs text-white border border-transparent"
                  style={{ backgroundColor: PARTY }}
                  title="点击移除"
                >
                  {f} ✕
                </button>
              ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={customFacility}
              onChange={(e) => setCustomFacility(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomFacility();
                }
              }}
              placeholder="自定义设施,回车添加"
              className={MODAL_INPUT}
            />
            <button
              type="button"
              onClick={addCustomFacility}
              className="px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA] flex-shrink-0"
            >
              添加
            </button>
          </div>
        </Field>
      </div>
      <ModalFooter
        onClose={onClose}
        onConfirm={() => {
          if (!name.trim()) {
            toast.error("请填写名称");
            return;
          }
          mut.mutate();
        }}
        loading={mut.isPending}
      />
    </Modal>
  );
}

/* ─── 新建会场图 弹窗(创建后跳设计器) ─── */

function NewLayoutModal({
  roomId,
  onClose,
  onCreated,
}: {
  roomId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const mut = useMutation({
    mutationFn: () => layoutApi.create({ roomId, name: name.trim() }),
    onSuccess: (created) => {
      toast.success("已创建,进入设计器");
      onCreated(created.id);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });
  return (
    <Modal title="新建会场图" onClose={onClose}>
      <Field label="会场图名称 *">
        <input value={name} onChange={(e) => setName(e.target.value)} className={MODAL_INPUT} placeholder="如:主席台+扇形排座" autoFocus />
      </Field>
      <ModalFooter
        onClose={onClose}
        onConfirm={() => {
          if (!name.trim()) {
            toast.error("请填写名称");
            return;
          }
          mut.mutate();
        }}
        loading={mut.isPending}
        confirmLabel="创建并设计"
      />
    </Modal>
  );
}

/* ─── 通用小组件 ─── */

const MODAL_INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-[#1A1A1A] mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#6B7280] mb-1">{label}</span>
      {children}
    </label>
  );
}

function ModalFooter({
  onClose,
  onConfirm,
  loading,
  confirmLabel = "保存",
}: {
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  confirmLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2 mt-5">
      <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]">
        取消
      </button>
      <button
        onClick={onConfirm}
        disabled={loading}
        className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-60"
        style={{ backgroundColor: PARTY }}
      >
        {loading ? "处理中…" : confirmLabel}
      </button>
    </div>
  );
}
