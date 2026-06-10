import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  SaveIcon,
  ArmchairIcon,
  Wand2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  AlertTriangleIcon,
  XIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { seatingApi, layoutApi, type PlanAssignment } from "../api";
import type { VenueDesignerState, SeatElement, ZoneElement } from "../lib/venueTypes";
import { emptyVenueState } from "../lib/venueUtils";
import { computeSeating, type SeatAssign } from "../lib/seating";
import { buildGroups, UNGROUPED } from "../lib/rosterGroups";
import { SeatingCanvas } from "../components/SeatingCanvas";

const PARTY = "var(--party-primary)";
/** 组色调色板(按组顺序取;座位按所属组上色,与图例一致) */
const GROUP_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316"];
const SEAT_EMPTY = "#EEF1F5";
const SEAT_RESERVED = "#FDE68A";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));

export default function SeatingArrangePage() {
  const { planId } = useParams<{ planId: string }>();
  const qc = useQueryClient();

  const planQuery = useQuery({
    queryKey: ["venue", "plan", planId],
    queryFn: () => seatingApi.get(planId!),
    enabled: !!planId,
  });
  const layoutId = planQuery.data?.layoutId;
  const layoutQuery = useQuery({
    queryKey: ["venue", "layout", layoutId],
    queryFn: () => layoutApi.get(layoutId!),
    enabled: !!layoutId,
  });

  const [groupZoneMap, setGroupZoneMap] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<SeatAssign[]>([]);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const mainRef = useRef<HTMLElement>(null);

  /* 会场图 layoutJson → 设计器状态 */
  const layoutState = useMemo<VenueDesignerState | null>(() => {
    if (!layoutQuery.data) return null;
    try {
      const parsed = JSON.parse(layoutQuery.data.layoutJson) as Partial<VenueDesignerState>;
      const empty = emptyVenueState(layoutQuery.data.width, layoutQuery.data.height, layoutQuery.data.gridSize);
      return { ...empty, ...parsed, background: parsed.background ?? empty.background, elements: parsed.elements ?? [] };
    } catch {
      return emptyVenueState();
    }
  }, [layoutQuery.data]);

  const roster = useMemo(() => planQuery.data?.roster ?? [], [planQuery.data]);
  const groups = useMemo(() => buildGroups(roster, []), [roster]);
  const realGroups = useMemo(() => groups.filter((g) => g.id !== UNGROUPED && g.attendees.length > 0), [groups]);
  const zones = useMemo<ZoneElement[]>(
    () => (layoutState?.elements.filter((e): e is ZoneElement => e.type === "zone") ?? []),
    [layoutState],
  );
  const groupColorMap = useMemo(() => {
    const m = new Map<string, string>();
    realGroups.forEach((g, i) => m.set(g.id, GROUP_COLORS[i % GROUP_COLORS.length]));
    return m;
  }, [realGroups]);

  /* 初始化:从 plan 还原已存的分区映射 + 排座结果(座位按 layout 全量,有人的填入) */
  useEffect(() => {
    if (!planQuery.data || !layoutState) return;
    const plan = planQuery.data;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroupZoneMap(plan.groupZoneMap ?? {});
    const attGroup = new Map(plan.roster.map((p) => [p.id, p.group]));
    const byId = new Map(plan.assignments.map((a) => [a.seatId, a]));
    const seats = layoutState.elements.filter((e): e is SeatElement => e.type === "seat");
    setAssignments(
      seats.map((s) => {
        const a = byId.get(s.id);
        return a && a.attendeeId
          ? {
              seatId: s.id,
              attendeeId: a.attendeeId,
              attendeeName: a.attendeeName ?? undefined,
              unit: a.unit ?? undefined,
              position: a.position ?? undefined,
              group: attGroup.get(a.attendeeId) ?? undefined,
            }
          : { seatId: s.id };
      }),
    );
    setSelectedSeatId(null);
  }, [planQuery.data, layoutState]);

  /* 座位底色 + 人名 */
  const { seatFill, seatLabel } = useMemo(() => {
    const fill = new Map<string, string>();
    const label = new Map<string, string>();
    if (!layoutState) return { seatFill: fill, seatLabel: label };
    const aBySeat = new Map(assignments.map((a) => [a.seatId, a]));
    for (const el of layoutState.elements) {
      if (el.type !== "seat") continue;
      const a = aBySeat.get(el.id);
      if (a?.attendeeId) {
        fill.set(el.id, groupColorMap.get(a.group ?? "") ?? GROUP_COLORS[0]);
        if (a.attendeeName) label.set(el.id, a.attendeeName);
      } else if (el.reserved) {
        fill.set(el.id, SEAT_RESERVED);
      } else {
        fill.set(el.id, SEAT_EMPTY);
      }
    }
    return { seatFill: fill, seatLabel: label };
  }, [layoutState, assignments, groupColorMap]);

  /* 统计 */
  const stats = useMemo(() => {
    const seatedIds = new Set(assignments.filter((a) => a.attendeeId).map((a) => a.attendeeId!));
    const unseated = roster.filter((p) => !seatedIds.has(p.id));
    const byGroup = realGroups.map((g) => {
      const seated = g.attendees.filter((p) => seatedIds.has(p.id)).length;
      const zone = zones.find((z) => z.id === groupZoneMap[g.id]);
      return { group: g.id, people: g.attendees.length, seated, zoneName: zone?.zoneName };
    });
    return { seated: seatedIds.size, total: roster.length, unseated, byGroup };
  }, [assignments, roster, realGroups, zones, groupZoneMap]);

  /* 缩放适配 */
  const computeFitZoom = useCallback(() => {
    const el = mainRef.current;
    if (!el || !layoutState) return 1;
    const pad = 48;
    const cw = el.clientWidth - pad;
    const ch = el.clientHeight - pad;
    if (cw <= 0 || ch <= 0) return 1;
    return clampZoom(Math.min(cw / layoutState.canvasWidth, ch / layoutState.canvasHeight, 1));
  }, [layoutState]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(computeFitZoom());
  }, [computeFitZoom]);

  /* 一键排座 */
  function handleArrange() {
    if (!layoutState) return;
    if (zones.length === 0) {
      toast.error("该会场图还没画「区域」,请先到设计器框选区域(给座位分区)再排座");
      return;
    }
    if (realGroups.length === 0) {
      toast.error("名单还没分组,请先到名单页把人拖进组");
      return;
    }
    if (realGroups.every((g) => !groupZoneMap[g.id])) {
      toast.error("请先给每个组指定一个区域");
      return;
    }
    const result = computeSeating(layoutState, roster, groupZoneMap);
    setAssignments(result.assignments);
    setSelectedSeatId(null);
    toast.success(
      `已排座 ${result.report.seated} 人` + (result.unseated.length ? `,${result.unseated.length} 人未排上` : ""),
    );
  }

  /* 拖拽换人:交换两座的人(座位 id 不变) */
  function onSwap(from: string, to: string) {
    setAssignments((prev) => {
      const arr = prev.map((a) => ({ ...a }));
      const A = arr.find((a) => a.seatId === from);
      const B = arr.find((a) => a.seatId === to);
      if (!A || !B) return prev;
      const tmp = { attendeeId: A.attendeeId, attendeeName: A.attendeeName, unit: A.unit, position: A.position, group: A.group };
      A.attendeeId = B.attendeeId; A.attendeeName = B.attendeeName; A.unit = B.unit; A.position = B.position; A.group = B.group;
      B.attendeeId = tmp.attendeeId; B.attendeeName = tmp.attendeeName; B.unit = tmp.unit; B.position = tmp.position; B.group = tmp.group;
      return arr;
    });
  }
  function onSeatClick(seatId: string) {
    setSelectedSeatId((cur) => (cur === seatId ? null : seatId));
  }
  function removeFromSeat(seatId: string) {
    setAssignments((prev) => prev.map((a) => (a.seatId === seatId ? { seatId } : a)));
  }

  /* 保存:分区映射 + 排座结果 */
  const saveMut = useMutation({
    mutationFn: async () => {
      await seatingApi.update(planId!, { groupZoneMap });
      const pa: PlanAssignment[] = assignments
        .filter((a) => a.attendeeId)
        .map((a) => ({
          seatId: a.seatId,
          attendeeId: a.attendeeId!,
          attendeeName: a.attendeeName ?? null,
          unit: a.unit ?? null,
          position: a.position ?? null,
        }));
      return seatingApi.saveAssignments(planId!, pa);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "plan", planId] });
      qc.invalidateQueries({ queryKey: ["venue", "plans"] });
      toast.success("已保存排座");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  if (planQuery.isLoading || layoutQuery.isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">加载中…</div>;
  }
  if (planQuery.isError || !planQuery.data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3AF]">
        选座方案不存在或已删除
        <Link to="/admin/venue/seating" className="text-[var(--party-primary)] hover:underline">返回列表</Link>
      </div>
    );
  }
  const plan = planQuery.data;
  const selectedSeat = layoutState?.elements.find((e) => e.id === selectedSeatId) as SeatElement | undefined;
  const selectedAssign = assignments.find((a) => a.seatId === selectedSeatId);

  return (
    <div className="h-full flex flex-col bg-[#F0F1F4]">
      {/* Header */}
      <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-shrink-0">
        <Link
          to={`/admin/venue/seating/${planId}`}
          className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          名单
        </Link>
        <div className="w-px h-6 bg-[#E9E9E9]" />
        <ArmchairIcon className="w-4 h-4" style={{ color: PARTY }} />
        <span className="text-sm font-semibold text-[#1A1A1A] truncate max-w-[220px]">{plan.name}</span>
        <span className="text-xs text-[#9CA3AF] hidden md:inline">
          {plan.roomName} · {plan.layoutName}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: PARTY }}
        >
          <SaveIcon className="w-4 h-4" />
          {saveMut.isPending ? "保存中…" : "保存排座"}
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 中:画布 */}
        <div className="flex-1 min-w-0 relative flex flex-col">
          <main ref={mainRef} className="flex-1 overflow-auto p-6 flex items-center justify-center">
            {layoutState ? (
              <SeatingCanvas
                state={layoutState}
                zoom={zoom}
                seatFill={seatFill}
                seatLabel={seatLabel}
                selectedSeatId={selectedSeatId}
                onSeatClick={onSeatClick}
                onSwap={onSwap}
              />
            ) : (
              <div className="text-sm text-[#9CA3AF]">会场图加载失败</div>
            )}
          </main>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-white border border-[#E9E9E9] rounded-full shadow-md px-1.5 py-1 text-[#6B7280]">
            <button onClick={() => setZoom((z) => clampZoom(z - 0.1))} title="缩小" className="p-1.5 rounded-full hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(1)} title="实际大小" className="min-w-[46px] px-1 py-1 rounded text-xs font-medium tabular-nums hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom((z) => clampZoom(z + 0.1))} title="放大" className="p-1.5 rounded-full hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
              <ZoomInIcon className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[#E9E9E9] mx-0.5" />
            <button onClick={() => setZoom(computeFitZoom())} title="适应屏幕" className="p-1.5 rounded-full hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
              <MaximizeIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 右:排座面板 */}
        <aside className="w-80 flex-shrink-0 flex flex-col bg-white border-l border-[#E9E9E9] overflow-auto">
          <div className="p-4 border-b border-[#F0F0F0]">
            <button
              onClick={handleArrange}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: PARTY }}
            >
              <Wand2Icon className="w-4 h-4" />
              一键智能排座
            </button>
            <p className="text-[11px] text-[#9CA3AF] mt-2 leading-relaxed">
              按「组 → 区域」映射,组内名单顺序(越靠前越尊位)对号入座,区内距主席台越近越靠前。排好后可拖动座位微调,再「保存排座」。
            </p>
          </div>

          {/* 前置条件提示 */}
          {zones.length === 0 && (
            <div className="mx-4 mt-3 p-2.5 rounded-lg bg-[#FEF3C7] text-[#92400E] text-xs flex gap-2">
              <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                该会场图还没有「区域」。请到
                {layoutId && (
                  <Link to={`/admin/venue/layouts/${layoutId}`} className="underline font-medium mx-1">
                    设计器
                  </Link>
                )}
                用「区域」元素框出机关区/基层区等,排座按区分配。
              </div>
            </div>
          )}
          {realGroups.length === 0 && (
            <div className="mx-4 mt-3 p-2.5 rounded-lg bg-[#FEF3C7] text-[#92400E] text-xs flex gap-2">
              <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                名单还没分组。请到
                <Link to={`/admin/venue/seating/${planId}`} className="underline font-medium mx-1">
                  名单页
                </Link>
                把人拖进「机关组/基层组…」,再来按组排座。
              </div>
            </div>
          )}

          {/* 组 → 区域 映射 */}
          {realGroups.length > 0 && (
            <div className="p-4 border-b border-[#F0F0F0]">
              <div className="text-xs font-bold text-[#1A1A1A] mb-2">组 → 区域</div>
              <div className="space-y-2">
                {realGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: groupColorMap.get(g.id) }} />
                    <span className="text-sm text-[#1A1A1A] truncate flex-1 min-w-0" title={g.id}>
                      {g.id}
                    </span>
                    <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{g.attendees.length}人</span>
                    <select
                      value={groupZoneMap[g.id] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGroupZoneMap((prev) => {
                          const next = { ...prev };
                          if (v) next[g.id] = v;
                          else delete next[g.id];
                          return next;
                        });
                      }}
                      disabled={zones.length === 0}
                      className="w-28 flex-shrink-0 px-2 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                    >
                      <option value="">未指定</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.zoneName || "未命名区"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 统计 */}
          <div className="p-4 border-b border-[#F0F0F0]">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[#1A1A1A] font-bold">
                已排 {stats.seated}
                <span className="text-[#9CA3AF] font-normal"> / {stats.total} 人</span>
              </span>
              {stats.unseated.length > 0 && <span className="text-[#EF4444] text-xs">未排 {stats.unseated.length}</span>}
            </div>
            {stats.byGroup.length > 0 && (
              <div className="mt-2 space-y-1">
                {stats.byGroup.map((b) => (
                  <div key={b.group} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: groupColorMap.get(b.group) }} />
                    <span className="text-[#6B7280] truncate flex-1 min-w-0">{b.group}</span>
                    <span className="text-[#9CA3AF] flex-shrink-0">
                      {b.seated}/{b.people}
                      {b.zoneName ? ` · ${b.zoneName}` : " · 未指定区"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 选中座位 */}
          {selectedSeat && (
            <div className="p-4 border-b border-[#F0F0F0]">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-[#1A1A1A]">选中座位</div>
                <button onClick={() => setSelectedSeatId(null)} className="p-0.5 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-sm text-[#1A1A1A]">{selectedSeat.name || selectedSeat.seatNo || "座位"}</div>
              {selectedAssign?.attendeeName ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-[var(--party-primary)] font-medium">{selectedAssign.attendeeName}</span>
                  {selectedAssign.unit && <span className="text-[11px] text-[#9CA3AF] truncate">{selectedAssign.unit}</span>}
                  <button
                    onClick={() => removeFromSeat(selectedSeat.id)}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#EF4444] hover:bg-[#FEE2E2]"
                  >
                    <UserXIcon className="w-3 h-3" />
                    移除
                  </button>
                </div>
              ) : (
                <div className="mt-1 text-xs text-[#9CA3AF]">空座(拖另一个座位的人到这里可调整)</div>
              )}
            </div>
          )}

          {/* 未排上 */}
          {stats.unseated.length > 0 && (
            <div className="p-4">
              <div className="text-xs font-bold text-[#EF4444] mb-2">未排上 {stats.unseated.length} 人</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.unseated.slice(0, 60).map((p) => (
                  <span key={p.id} className="px-2 py-0.5 rounded bg-[#FEF2F2] text-[#B91C1C] text-xs" title={`${p.unit ?? ""} ${p.position ?? ""}`}>
                    {p.name}
                    {!p.group && <span className="text-[#F59E0B]"> (未分组)</span>}
                  </span>
                ))}
                {stats.unseated.length > 60 && <span className="text-xs text-[#9CA3AF]">…等 {stats.unseated.length} 人</span>}
              </div>
              <p className="text-[10px] text-[#9CA3AF] mt-2 leading-relaxed">
                原因:所在组未指定区域、或区内座位不够、或未分组。可调整映射 / 名单分组后重排,或拖到空座。
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
