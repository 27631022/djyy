import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  UsersIcon,
  SquareDashedIcon,
  ArmchairIcon,
  Wand2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  AlertTriangleIcon,
  PencilIcon,
  XIcon,
  UserXIcon,
  SaveIcon,
  FileTextIcon,
  PrinterIcon,
  Building2Icon,
  ChevronDownIcon,
  PlusIcon,
  GripVerticalIcon,
  DownloadIcon,
  ImageIcon,
  FileSpreadsheetIcon,
  ContactIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  seatingApi,
  roomApi,
  layoutApi,
  type Attendee,
  type PlanAssignment,
  type UpdateSeatingPlanInput,
} from "../api";
import type { VenueDesignerState, SeatElement, ZoneElement } from "../lib/venueTypes";
import { emptyVenueState, genId } from "../lib/venueUtils";
import { computeSeating, resolveAnchor, type SeatAssign } from "../lib/seating";
import { buildGroups, assignScores, UNGROUPED } from "../lib/rosterGroups";
import { SeatingCanvas } from "../components/SeatingCanvas";
import { RosterEditor } from "../components/RosterEditor";
import { RoomPicker } from "../components/RoomPicker";
import { VenueLayoutEditor, type VenueLayoutEditorHandle } from "../components/designer/VenueLayoutEditor";
import { AiButton } from "@/shared/components/AiButton";
import { generateSeatingImageDataUrl, exportDeskCardsPdf, triggerDownload } from "../lib/venueExport";
import { buildSeatingRows, buildDeskCardPeople, buildSigninRows, printTable } from "../lib/seatingExport";

const PARTY = "var(--party-primary)";
const GROUP_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316"];
const EXPORT_BTN =
  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[#E9E9E9] text-[#374151] hover:bg-[#F7F8FA] disabled:opacity-50 disabled:cursor-not-allowed";
const SEAT_EMPTY = "#EEF1F5";
const SEAT_RESERVED = "#FDE68A";
const SEAT_SPECIAL = "#14B8A6"; // 特殊人员(来宾/记者…)座位色,区别组色/预留/空
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
const INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const STEPS: { n: Step; label: string; desc: string; icon: typeof UsersIcon }[] = [
  { n: 1, label: "会议信息", desc: "上传识别 / 手填", icon: FileTextIcon },
  { n: 2, label: "选择座次图", desc: "按会场/人数挑图", icon: LayoutGridIcon },
  { n: 3, label: "新建 / 编辑座次图", desc: "复制改 / 去设计器", icon: PencilIcon },
  { n: 4, label: "导入人员", desc: "分组 + 特殊人员", icon: UsersIcon },
  { n: 5, label: "分区与占座", desc: "划区 + 特殊占座", icon: SquareDashedIcon },
  { n: 6, label: "智能排座", desc: "一键排 + 拖动微调", icon: ArmchairIcon },
  { n: 7, label: "生成与导出", desc: "座位图 / 桌签", icon: PrinterIcon },
];
const CANVAS_STEPS: Step[] = [2, 5, 6];

function makeZone(rect: { x: number; y: number; width: number; height: number }, name: string, color: string): ZoneElement {
  return {
    id: genId("zone"),
    type: "zone",
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name,
    zoneName: name,
    color,
  };
}

/** 本地 datetime-local 字符串 + 分钟 → 本地 datetime-local 字符串 */
function addMinutes(dt: string, min: number): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  const e = new Date(d.getTime() + min * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}T${p(e.getHours())}:${p(e.getMinutes())}`;
}

/** 默认开始时间:5 天后 09:00(本地 datetime-local 字符串) */
function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  d.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 按参会人数命中最合适的预制座次图:座位数 ≥ 人数 里最小的;都不够时取最大的 */
function pickBestFitLayout(layouts: { id: string; seatCount: number }[], headcount: number): string | null {
  if (!layouts.length || headcount <= 0) return null;
  const enough = layouts.filter((l) => l.seatCount >= headcount).sort((a, b) => a.seatCount - b.seatCount);
  if (enough.length) return enough[0].id;
  return [...layouts].sort((a, b) => b.seatCount - a.seatCount)[0]?.id ?? null;
}

/* Step5 可拖拽的组卡(拖动 = 调整排座优先级) */
function SortableGroupRow({
  id,
  index,
  count,
  color,
  hasZone,
  picking,
  onPick,
  onClear,
}: {
  id: string;
  index: number;
  count: number;
  color?: string;
  hasZone: boolean;
  picking: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border p-2.5 bg-white ${picking ? "border-[var(--party-primary)] bg-party-soft" : "border-[#E9E9E9]"}`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-[#C4C4C4] hover:text-[#6B7280] touch-none flex-shrink-0"
          title="拖拽调整排座优先级"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </button>
        <span className="w-5 h-5 rounded-full bg-party-soft text-[var(--party-primary)] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm text-[#1A1A1A] truncate flex-1 min-w-0">{id}</span>
        <span className="text-[11px] text-[#9CA3AF]">{count}人</span>
      </div>
      <div className="flex items-center gap-1.5 mt-2 pl-6">
        <button
          onClick={onPick}
          className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
            picking ? "bg-[var(--party-primary)] text-white" : "border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft"
          }`}
        >
          {picking ? "取消" : hasZone ? "重划" : "画区域"}
        </button>
        {hasZone && (
          <>
            <span className="text-[11px] text-green-600 flex items-center gap-0.5">
              <CheckIcon className="w-3 h-3" />已划
            </span>
            <button onClick={onClear} className="p-1 rounded text-[#9CA3AF] hover:text-red-600" title="清除该区域">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SeatingWizard() {
  const { planId } = useParams<{ planId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 草稿态:planId="new" → 还没建会议记录;第1步「下一步」才真正创建(避免点进来就白多一条)
  const isDraft = planId === "new";

  const planQuery = useQuery({
    queryKey: ["venue", "plan", planId],
    queryFn: () => seatingApi.get(planId!),
    enabled: !!planId && !isDraft,
  });
  const layoutId = planQuery.data?.layoutId;
  const layoutQuery = useQuery({
    queryKey: ["venue", "layout", layoutId],
    queryFn: () => layoutApi.get(layoutId!),
    enabled: !!layoutId,
  });

  const [step, setStep] = useState<Step>(() => {
    const s = Number(searchParams.get("step"));
    return s >= 1 && s <= 7 ? (s as Step) : 1;
  });
  const [name, setName] = useState("");
  const [meetingStart, setMeetingStart] = useState(() => (planId === "new" ? defaultStart() : ""));
  const [meetingEnd, setMeetingEnd] = useState(() => (planId === "new" ? addMinutes(defaultStart(), 120) : ""));
  const [durationMin, setDurationMin] = useState(120);
  const [meetingNote, setMeetingNote] = useState("");
  const [meetingHeadcount, setMeetingHeadcount] = useState<number | "">("");
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [layoutChoice, setLayoutChoice] = useState<string | null>(null); // Step2 选中:"blank" | 预制图 id
  const [appliedChoice, setAppliedChoice] = useState<string | null>(null); // 已应用过的选择(避免来回重复复制/新建)
  const [roster, setRoster] = useState<Attendee[]>([]);
  const [zones, setZones] = useState<ZoneElement[]>([]);
  const [groupZoneMap, setGroupZoneMap] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<SeatAssign[]>([]);
  const [reservedSeatIds, setReservedSeatIds] = useState<string[]>([]); // 方案级预留座(记者站位/设备位),自动排跳过
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [pickedAttendeeId, setPickedAttendeeId] = useState<string | null>(null); // Step6:未排名单里点选/拖拽的人
  const draggingAttendeeRef = useRef<string | null>(null);
  const [selectedGroupForDraw, setSelectedGroupForDraw] = useState<string | null>(null);
  const [anchorOverride, setAnchorOverride] = useState<{ x: number; y: number } | null>(null); // 手动中心参照点
  const [anchorMode, setAnchorMode] = useState(false); // Step5:在图上点选中心
  const [zoom, setZoom] = useState(1);
  const mainRef = useRef<HTMLElement>(null);
  const initKeyRef = useRef("");
  const editorRef = useRef<VenueLayoutEditorHandle>(null);
  const groupSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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

  /* 第2步:选中卡片时,左侧画布预览「所选座次图」(而非当前/占位图)→ 画布跟着选择动 */
  const previewLayoutQuery = useQuery({
    queryKey: ["venue", "layout", layoutChoice],
    queryFn: () => layoutApi.get(layoutChoice!),
    enabled: step === 2 && !!layoutChoice && layoutChoice !== "blank",
  });
  const step2State = useMemo<VenueDesignerState | null>(() => {
    if (layoutChoice === "blank") return emptyVenueState();
    if (layoutChoice && previewLayoutQuery.data) {
      try {
        const l = previewLayoutQuery.data;
        const parsed = JSON.parse(l.layoutJson) as Partial<VenueDesignerState>;
        const empty = emptyVenueState(l.width, l.height, l.gridSize);
        return { ...empty, ...parsed, background: parsed.background ?? empty.background, elements: parsed.elements ?? [] };
      } catch {
        return emptyVenueState();
      }
    }
    return layoutState; // 未选 → 当前/占位图
  }, [layoutChoice, previewLayoutQuery.data, layoutState]);

  // 生效的中心参照点(手动 > 主席台 > 会议桌 > 最前排中央);排座 + 画布标记都用它
  const effectiveAnchor = useMemo(
    () => (layoutState ? resolveAnchor(layoutState, anchorOverride) : null),
    [layoutState, anchorOverride],
  );
  const anchorSrc = anchorOverride
    ? "手动指定"
    : layoutState?.elements.some((e) => e.type === "presidium")
      ? "主席台"
      : layoutState?.elements.some((e) => e.type === "table-rect" || e.type === "table-round")
        ? "会议桌"
        : layoutState?.elements.some((e) => e.type === "seat")
          ? "最前排中央"
          : "默认上方";

  /* 初始化:每个 plan+layout 只灌一次(换图后 key 变会重灌) */
  useEffect(() => {
    if (!planQuery.data || !layoutState) return;
    const key = `${planId}|${layoutId}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    const plan = planQuery.data;
    setName(plan.name);
    const s0 = plan.meeting?.startAt || defaultStart();
    setMeetingStart(s0);
    setMeetingEnd(plan.meeting?.endAt || addMinutes(s0, 120));
    setMeetingNote(plan.meeting?.note ?? "");
    setMeetingHeadcount(plan.meeting?.headcount ?? "");
    setRoster(plan.roster);
    setZones(plan.zones ?? []);
    setGroupZoneMap(plan.groupZoneMap ?? {});
    setReservedSeatIds(plan.reservedSeatIds ?? []);
    setAnchorOverride(plan.anchor ?? null);
    // assignment.attendeeId 可能与当前 roster.id 脱钩(历史:后端曾按下标重排 roster id,
    // 而 assignment 存的是排座当时的旧 id)→ 图上按姓名有人、但「未排上」按 id 比对全不中 →
    // 误报全部未排。这里按 id 命中,失配则按姓名(+单位)找回正确 roster id,使统计与图一致;
    // 保存后即以对齐后的 id 落库自愈。
    const rosterIdSet = new Set(plan.roster.map((p) => p.id));
    const rosterByKey = new Map<string, string>();
    for (const p of plan.roster) {
      const k = `${p.name}|${p.unit ?? ""}`;
      if (!rosterByKey.has(k)) rosterByKey.set(k, p.id);
      if (!rosterByKey.has(p.name)) rosterByKey.set(p.name, p.id);
    }
    const resolveAttId = (a: PlanAssignment): string | undefined => {
      if (!a.attendeeId) return undefined;
      if (rosterIdSet.has(a.attendeeId)) return a.attendeeId;
      return (
        rosterByKey.get(`${a.attendeeName ?? ""}|${a.unit ?? ""}`) ??
        rosterByKey.get(a.attendeeName ?? "") ??
        a.attendeeId
      );
    };
    const attGroup = new Map(plan.roster.map((p) => [p.id, p.group]));
    const attSpecial = new Map(plan.roster.map((p) => [p.id, p.special]));
    const byId = new Map(plan.assignments.map((a) => [a.seatId, a]));
    const seats = layoutState.elements.filter((e): e is SeatElement => e.type === "seat");
    setAssignments(
      seats.map((s) => {
        const a = byId.get(s.id);
        if (!a || !a.attendeeId) return { seatId: s.id };
        const attId = resolveAttId(a);
        return {
          seatId: s.id,
          attendeeId: attId,
          attendeeName: a.attendeeName ?? undefined,
          unit: a.unit ?? undefined,
          position: a.position ?? undefined,
          group: (attId ? attGroup.get(attId) : undefined) ?? undefined,
          special: (attId ? attSpecial.get(attId) : undefined) ?? undefined,
          locked: a.source === "locked",
        };
      }),
    );
  }, [planQuery.data, layoutState, planId, layoutId]);

  const groups = useMemo(() => buildGroups(roster, []), [roster]);
  const realGroups = useMemo(() => groups.filter((g) => g.id !== UNGROUPED && g.attendees.length > 0), [groups]);
  const groupColorMap = useMemo(() => {
    const m = new Map<string, string>();
    realGroups.forEach((g, i) => m.set(g.id, GROUP_COLORS[i % GROUP_COLORS.length]));
    return m;
  }, [realGroups]);
  const zonesForView = useMemo<ZoneElement[]>(() => {
    const zoneToGroup = new Map<string, string>();
    for (const [g, zid] of Object.entries(groupZoneMap)) zoneToGroup.set(zid, g);
    return zones.map((z) => {
      const g = zoneToGroup.get(z.id);
      return g ? { ...z, color: groupColorMap.get(g) ?? z.color, zoneName: g } : z;
    });
  }, [zones, groupZoneMap, groupColorMap]);

  const { seatFill, seatLabel } = useMemo(() => {
    const fill = new Map<string, string>();
    const label = new Map<string, string>();
    if (!layoutState) return { seatFill: fill, seatLabel: label };
    const aBySeat = new Map(assignments.map((a) => [a.seatId, a]));
    for (const el of layoutState.elements) {
      if (el.type !== "seat") continue;
      const a = aBySeat.get(el.id);
      if (a?.attendeeId) {
        // 特殊人员座位用特殊色;否则跟组色
        fill.set(el.id, a.special ? SEAT_SPECIAL : (groupColorMap.get(a.group ?? "") ?? GROUP_COLORS[0]));
        if (a.attendeeName) label.set(el.id, a.attendeeName);
      } else if (el.reserved || reservedSeatIds.includes(el.id)) {
        fill.set(el.id, SEAT_RESERVED); // 元素级预留 或 方案级预留
      } else {
        fill.set(el.id, SEAT_EMPTY);
      }
    }
    return { seatFill: fill, seatLabel: label };
  }, [layoutState, assignments, groupColorMap, reservedSeatIds]);

  const lockedSeatIds = useMemo(
    () => new Set(assignments.filter((a) => a.locked && a.attendeeId).map((a) => a.seatId)),
    [assignments],
  );

  const stats = useMemo(() => {
    const seatedIds = new Set(assignments.filter((a) => a.attendeeId).map((a) => a.attendeeId!));
    const unseated = roster.filter((p) => !seatedIds.has(p.id));
    return { seated: seatedIds.size, total: roster.length, unseated };
  }, [assignments, roster]);

  /* ───────── Step7 生成与导出 ───────── */
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null); // 进行中的导出 key(按钮 loading)
  const meetingTitle = (name || planQuery.data?.name || "会议").trim();
  const meetingDateStr = (meetingStart || planQuery.data?.meeting?.startAt || planQuery.data?.eventDate || "").slice(0, 10);
  const exportSubtitle = [meetingTitle, meetingDateStr].filter(Boolean).join("  ·  ");

  // 进入第7步时生成座位安排图预览(带人名/组色)。
  // 不在 effect 里同步 setState(避免 cascading-render warning);异步 .then 里更新即可——
  // 旧预览会保留到新图生成完成(~100ms),首次为 null 显示「生成预览…」。
  useEffect(() => {
    if (step !== 7 || !layoutState) return;
    let alive = true;
    generateSeatingImageDataUrl(layoutState, { seatFill, seatLabel }, "png")
      .then((url) => alive && setExportPreview(url))
      .catch(() => alive && setExportPreview(null));
    return () => {
      alive = false;
    };
  }, [step, layoutState, seatFill, seatLabel]);

  async function exportImage(format: "png" | "pdf") {
    if (!layoutState) return;
    setExportBusy(`image-${format}`);
    try {
      const url = await generateSeatingImageDataUrl(layoutState, { seatFill, seatLabel }, format);
      triggerDownload(url, `${meetingTitle}-座位图.${format}`);
    } catch {
      toast.error("生成座位图失败");
    } finally {
      setExportBusy(null);
    }
  }

  function exportDeskCards() {
    if (!layoutState) return;
    const people = buildDeskCardPeople(layoutState, assignments);
    if (people.length === 0) {
      toast.error("还没有排好座的人,无法生成桌签");
      return;
    }
    setExportBusy("desk");
    try {
      exportDeskCardsPdf(people, `${meetingTitle}-桌签.pdf`);
    } finally {
      setExportBusy(null);
    }
  }

  function printArrangement() {
    if (!layoutState) return;
    const rows = buildSeatingRows(layoutState, assignments);
    if (rows.length === 0) {
      toast.error("还没有排好座的人");
      return;
    }
    const ok = printTable({
      title: `${meetingTitle} 座位安排表`,
      subtitle: exportSubtitle,
      columns: [
        { key: "seq", label: "序号", width: "7%" },
        { key: "seat", label: "座位", width: "16%" },
        { key: "name", label: "姓名", width: "14%" },
        { key: "unit", label: "单位" },
        { key: "position", label: "职务", width: "18%" },
      ],
      rows,
    });
    if (!ok) toast.error("打印窗口被浏览器拦截,请允许弹出窗口");
  }

  function printSignin() {
    const rows = buildSigninRows(roster);
    if (rows.length === 0) {
      toast.error("名单为空");
      return;
    }
    const ok = printTable({
      title: `${meetingTitle} 签到表`,
      subtitle: exportSubtitle,
      columns: [
        { key: "seq", label: "序号", width: "7%" },
        { key: "name", label: "姓名", width: "14%" },
        { key: "unit", label: "单位" },
        { key: "position", label: "职务", width: "16%" },
        { key: "group", label: "分组", width: "12%" },
        { key: "sign", label: "签到", width: "18%" },
      ],
      rows,
    });
    if (!ok) toast.error("打印窗口被浏览器拦截,请允许弹出窗口");
  }

  async function downloadExcel(type: "arrangement" | "signin") {
    if (planId === "new" || !planQuery.data) {
      toast.error("请先完成前面步骤再导出 Excel");
      return;
    }
    setExportBusy(`xlsx-${type}`);
    try {
      const blob = await seatingApi.exportXlsx(planId, type);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${meetingTitle}-${type === "signin" ? "签到表" : "座位安排表"}.xlsx`);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出 Excel 失败");
    } finally {
      setExportBusy(null);
    }
  }

  // 第2步用预览图、其余步用当前图来做「适应屏幕」与画布
  const fitTarget = step === 2 ? step2State : layoutState;
  const computeFitZoom = useCallback(() => {
    const el = mainRef.current;
    if (!el || !fitTarget) return 1;
    const pad = 48;
    const cw = el.clientWidth - pad;
    const ch = el.clientHeight - pad;
    if (cw <= 0 || ch <= 0) return 1;
    return clampZoom(Math.min(cw / fitTarget.canvasWidth, ch / fitTarget.canvasHeight, 1));
  }, [fitTarget]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(computeFitZoom());
  }, [computeFitZoom, step]);

  const saveMut = useMutation({
    mutationFn: (payload: UpdateSeatingPlanInput) => seatingApi.update(planId!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "plans"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /* 选图 / 换图 */
  const roomsQuery = useQuery({ queryKey: ["venue", "rooms"], queryFn: () => roomApi.list() });
  const [pickRoomId, setPickRoomId] = useState(() => searchParams.get("room") || "");
  const effectiveRoomId = pickRoomId || planQuery.data?.roomId || "";
  const roomLayoutsQuery = useQuery({
    queryKey: ["venue", "layouts", effectiveRoomId, "published"],
    queryFn: () => layoutApi.list(effectiveRoomId, "published"),
    enabled: !!effectiveRoomId,
  });
  /* 进入第2步且没选过时,按参会人数自动命中最合适的预制座次图 */
  useEffect(() => {
    if (step !== 2 || layoutChoice) return;
    const layouts = roomLayoutsQuery.data ?? [];
    if (typeof meetingHeadcount !== "number" || meetingHeadcount <= 0) return;
    const fit = pickBestFitLayout(layouts, meetingHeadcount);
    if (!fit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayoutChoice(fit);
  }, [step, layoutChoice, roomLayoutsQuery.data, meetingHeadcount]);
  /* Step2「下一步」:按选中卡片创建空白 / 复制预制 → 本会议专属草稿图 → 进第 3 步(内嵌设计器微调)。
     来回切步时,同一选择不重复复制(复用已建草稿)。 */
  async function applyLayoutChoiceAndEdit() {
    const curIsDraft = layoutQuery.data?.status === "draft";
    const base = (name || planQuery.data?.name || "新会议").trim();
    const dateStr = (meetingStart || planQuery.data?.meeting?.startAt || "").slice(0, 10); // 时间(YYYY-MM-DD)
    const hc = typeof meetingHeadcount === "number" && meetingHeadcount > 0 ? meetingHeadcount : 0;
    // 座次图默认名 = 时间 + 会议名 + 人数
    const layoutName = [dateStr, base, hc > 0 ? `${hc}人` : ""].filter(Boolean).join(" ") || `${base} 座次图`;
    setNavBusy(true);
    try {
      let targetId: string | null = null;
      if (layoutChoice === "blank") {
        if (appliedChoice === "blank" && curIsDraft && layoutId) {
          targetId = layoutId; // 已建过空白草稿,复用
        } else {
          if (!effectiveRoomId) {
            toast.error("请先回第 1 步选会场");
            return;
          }
          const blank = await layoutApi.create({
            roomId: effectiveRoomId,
            name: layoutName,
            gridSize: 10, // 网格加密:座位 = 横竖各 4 格
          });
          await layoutApi.update(blank.id, { status: "draft" }); // 草稿:本会议专属,不进别的会议预制列表
          await saveMut.mutateAsync({ layoutId: blank.id });
          setAppliedChoice("blank");
          targetId = blank.id;
        }
      } else if (layoutChoice) {
        if (appliedChoice === layoutChoice && curIsDraft && layoutId) {
          targetId = layoutId; // 已复制过同一张预制,复用
        } else {
          const dup = await layoutApi.duplicate(layoutChoice); // 复制预制图为草稿,不动原图
          await layoutApi.update(dup.id, { name: layoutName }); // 命名 = 会议名(参会人数)
          await saveMut.mutateAsync({ layoutId: dup.id });
          setAppliedChoice(layoutChoice);
          targetId = dup.id;
        }
      } else if (curIsDraft && layoutId) {
        targetId = layoutId; // 没新选但当前已是本会议草稿图,直接用
      } else {
        toast.error("请先选择一张预制座次图,或「空白座次图」");
        return;
      }
      if (!targetId) return;
      initKeyRef.current = "";
      await qc.invalidateQueries({ queryKey: ["venue", "plan", planId] });
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setNavBusy(false);
    }
  }

  /* Step5 画框给组 */
  function onDrawZone(rect: { x: number; y: number; width: number; height: number }) {
    const g = selectedGroupForDraw;
    if (!g) {
      toast.error("先在右侧点一个组,再在座次图上拖框");
      return;
    }
    const color = groupColorMap.get(g) ?? GROUP_COLORS[0];
    const zone = makeZone(rect, g, color);
    const oldZid = groupZoneMap[g];
    setZones((prev) => [...prev.filter((z) => z.id !== oldZid), zone]);
    setGroupZoneMap((prev) => ({ ...prev, [g]: zone.id }));
    setSelectedGroupForDraw(null);
    toast.success(`已为「${g}」划定区域`);
  }
  function clearGroupZone(g: string) {
    const zid = groupZoneMap[g];
    setZones((prev) => prev.filter((z) => z.id !== zid));
    setGroupZoneMap((prev) => {
      const n = { ...prev };
      delete n[g];
      return n;
    });
  }

  /* Step5 中心参照点:点图设定 / 恢复自动(都即时存盘) */
  function setAnchorAt(pt: { x: number; y: number }) {
    setAnchorOverride(pt);
    setAnchorMode(false);
    saveMut.mutate({ anchor: pt });
    toast.success("已设为中心参照点");
  }
  function resetAnchor() {
    setAnchorOverride(null);
    setAnchorMode(false);
    saveMut.mutate({ anchor: null });
    toast.success("已恢复自动中心");
  }

  /* Step5 拖拽组卡 → 调整排座优先级(重排名单组块顺序;靠前=先排,重叠区域先占座) */
  function onGroupDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = realGroups.map((g) => g.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const newOrder = arrayMove(ids, from, to);
    const byGroup = new Map<string, Attendee[]>();
    const ungrouped: Attendee[] = [];
    for (const a of roster) {
      const g = a.group?.trim();
      if (!g) ungrouped.push(a);
      else {
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(a);
      }
    }
    const next: Attendee[] = [];
    for (const gid of newOrder) next.push(...(byGroup.get(gid) ?? []));
    for (const [g, arr] of byGroup) if (!newOrder.includes(g)) next.push(...arr);
    next.push(...ungrouped);
    const scored = assignScores(next);
    setRoster(scored);
    saveMut.mutate({ roster: scored });
  }

  /* Step6 排座 */
  function handleArrange() {
    if (!layoutState) return;
    const lockedAssignments = assignments.filter((a) => a.locked && a.attendeeId);
    // 已有「未锁定」的排座 → 重新一键排座会覆盖它们(🔒 锁定的保持不变),先确认
    if (
      assignments.some((a) => a.attendeeId && !a.locked) &&
      !window.confirm("重新排座会覆盖未锁定的座位安排(🔒 锁定的保持不变),确定继续?")
    ) {
      return;
    }
    if (roster.length === 0) {
      toast.error("名单为空,请回第 4 步导入人员");
      return;
    }
    const arrangeOpts = { lockedAssignments, reservedSeatIds };
    if (realGroups.length === 0) {
      const result = computeSeating(layoutState, roster, {}, [], anchorOverride, arrangeOpts);
      setAssignments(result.assignments);
      setSelectedSeatId(null);
      toast.success(
        `已按名单顺序排座 ${result.report.seated} 人` +
          (result.unseated.length ? `,${result.unseated.length} 人座位不够未排上` : ""),
      );
      return;
    }
    if (realGroups.every((g) => !groupZoneMap[g.id])) {
      toast.error("还没给组划区域,请回第 5 步在图上画框");
      return;
    }
    const result = computeSeating(layoutState, roster, groupZoneMap, zones, anchorOverride, arrangeOpts);
    setAssignments(result.assignments);
    setSelectedSeatId(null);
    const lockedCount = arrangeOpts.lockedAssignments.length;
    toast.success(
      `已排座 ${result.report.seated} 人` +
        (lockedCount ? `(含 ${lockedCount} 个锁定)` : "") +
        (result.unseated.length ? `,${result.unseated.length} 人未排上` : ""),
    );
  }
  function onSwap(from: string, to: string) {
    setAssignments((prev) => {
      const arr = prev.map((a) => ({ ...a }));
      const A = arr.find((a) => a.seatId === from);
      const B = arr.find((a) => a.seatId === to);
      if (!A || !B) return prev;
      const t = { attendeeId: A.attendeeId, attendeeName: A.attendeeName, unit: A.unit, position: A.position, group: A.group, special: A.special };
      A.attendeeId = B.attendeeId; A.attendeeName = B.attendeeName; A.unit = B.unit; A.position = B.position; A.group = B.group; A.special = B.special;
      B.attendeeId = t.attendeeId; B.attendeeName = t.attendeeName; B.unit = t.unit; B.position = t.position; B.group = t.group; B.special = t.special;
      A.locked = true; B.locked = true; // 手动交换后锁定,重新一键排座不动
      return arr;
    });
  }
  function removeFromSeat(seatId: string) {
    setAssignments((prev) => prev.map((a) => (a.seatId === seatId ? { seatId } : a)));
  }
  /* 把未排名单里点选/拖拽的人放进某座位(占用则换下原占座者 → 回到未排) */
  function placeAttendee(attendeeId: string, seatId: string) {
    const person = roster.find((p) => p.id === attendeeId);
    if (!person) return;
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.seatId === seatId)
          return {
            seatId,
            attendeeId: person.id,
            attendeeName: person.name,
            unit: person.unit,
            position: person.position,
            group: person.group,
            special: person.special,
            locked: true, // 手动指定座位即锁定,重新一键排座不动
          };
        if (a.attendeeId === attendeeId) return { seatId: a.seatId }; // 从原座位移走,避免一人两座
        return a;
      }),
    );
    setPickedAttendeeId(null);
  }
  /* Step6 锁定/解锁某座(钉死,重新一键排座不动) */
  function toggleLock(seatId: string) {
    setAssignments((prev) =>
      prev.map((a) => (a.seatId === seatId && a.attendeeId ? { ...a, locked: !a.locked } : a)),
    );
  }
  /* Step6 预留/取消预留某空座(记者站位/设备位,自动排跳过、不排人) */
  function toggleReserve(seatId: string) {
    setReservedSeatIds((prev) =>
      prev.includes(seatId) ? prev.filter((x) => x !== seatId) : [...prev, seatId],
    );
  }

  const saveAssignMut = useMutation({
    mutationFn: async () => {
      await seatingApi.update(planId!, { roster: assignScores(roster), zones, groupZoneMap, reservedSeatIds });
      const pa: PlanAssignment[] = assignments
        .filter((a) => a.attendeeId)
        .map((a) => ({
          seatId: a.seatId,
          attendeeId: a.attendeeId!,
          attendeeName: a.attendeeName ?? null,
          unit: a.unit ?? null,
          position: a.position ?? null,
          source: a.locked ? "locked" : "auto", // 锁定回存,加载时还原 locked
        }));
      return seatingApi.saveAssignments(planId!, pa);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "plans"] });
      toast.success("已保存排座");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /* 草稿态第1步「下一步」:用占位座次图真正创建会议 + 写会议信息 → 进真实方案第2步 */
  async function createDraftPlan(
    meetingName: string,
    meeting: { startAt?: string; endAt?: string; note?: string; headcount?: number },
  ) {
    try {
      const inRoom = pickRoomId ? await layoutApi.list(pickRoomId, "published") : [];
      const placeholder = inRoom[0] || (await layoutApi.list(undefined, "published"))[0];
      if (!placeholder) {
        toast.error("还没有任何「已发布」的座次图,请先到「会议室 / 会场图」建一张并发布");
        return;
      }
      const created = await seatingApi.create({ layoutId: placeholder.id, name: meetingName });
      await seatingApi.update(created.id, { meeting });
      qc.invalidateQueries({ queryKey: ["venue", "plans"] });
      const roomQ = pickRoomId ? `&room=${pickRoomId}` : "";
      navigate(`/admin/venue/seating/${created.id}/wizard?step=2${roomQ}`, { replace: true });
      setStep(2); // 同路由复用组件、lazy init 不重跑,需显式切到第2步(否则要点两次「下一步」)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  }

  /* 导航 */
  const [navBusy, setNavBusy] = useState(false);
  async function goNext() {
    if (step === 1) {
      const endAt = meetingEnd || addMinutes(meetingStart, durationMin);
      const meeting = {
        startAt: meetingStart || undefined,
        endAt: endAt || undefined,
        note: meetingNote || undefined,
        headcount: typeof meetingHeadcount === "number" ? meetingHeadcount : undefined,
      };
      if (isDraft) {
        if (!pickRoomId) {
          toast.error("请先选择会场");
          return;
        }
        setNavBusy(true);
        try {
          await createDraftPlan(name.trim() || "未命名会议", meeting);
        } finally {
          setNavBusy(false);
        }
        return; // 成功后已导航到真实方案第2步
      }
      setNavBusy(true);
      try {
        await saveMut.mutateAsync({ name: name.trim() || planQuery.data?.name || "未命名会议", meeting });
      } finally {
        setNavBusy(false);
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      await applyLayoutChoiceAndEdit();
      return;
    }
    if (step === 3) {
      // 内嵌设计器:下一步先落库再前进(保存失败则留在本步)
      setNavBusy(true);
      try {
        await editorRef.current?.save();
      } catch {
        setNavBusy(false);
        return;
      }
      setNavBusy(false);
      setStep(4);
      return;
    }
    if (step === 4) {
      if (roster.length === 0) {
        toast.error("请先导入人员");
        return;
      }
      setNavBusy(true);
      try {
        await saveMut.mutateAsync({ roster: assignScores(roster) });
      } finally {
        setNavBusy(false);
      }
      setStep(realGroups.length === 0 ? 6 : 5); // 没分组 → 跳过分区与占座
      return;
    }
    if (step === 5) {
      setNavBusy(true);
      try {
        await saveMut.mutateAsync({ zones, groupZoneMap });
      } finally {
        setNavBusy(false);
      }
      setStep(6);
      return;
    }
    if (step === 6) {
      setStep(7);
      return;
    }
  }
  function goPrev() {
    if (step === 6 && realGroups.length === 0) {
      setStep(4); // 跳过分区
      return;
    }
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  if (!isDraft && (planQuery.isLoading || layoutQuery.isLoading)) {
    return <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">加载中…</div>;
  }
  if (!isDraft && (planQuery.isError || !planQuery.data)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3AF]">
        会议排座方案不存在或已删除
        <Link to="/admin/venue/seating" className="text-[var(--party-primary)] hover:underline">返回列表</Link>
      </div>
    );
  }
  const plan = planQuery.data; // 草稿态(isDraft)为 undefined,仅第1步可用
  const selectedSeat = layoutState?.elements.find((e) => e.id === selectedSeatId) as SeatElement | undefined;
  const selectedAssign = assignments.find((a) => a.seatId === selectedSeatId);
  const pickedUnseated = pickedAttendeeId ? (stats.unseated.find((p) => p.id === pickedAttendeeId) ?? null) : null;
  const rooms = roomsQuery.data ?? [];
  const roomLayouts = roomLayoutsQuery.data ?? [];
  const bestFitLayoutId = typeof meetingHeadcount === "number" ? pickBestFitLayout(roomLayouts, meetingHeadcount) : null;
  const currentRoom = rooms.find((r) => r.id === effectiveRoomId);

  return (
    <div className="h-full flex flex-col bg-[#F0F1F4]">
      <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-shrink-0">
        <Link to="/admin/venue/seating" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]">
          <ArrowLeftIcon className="w-4 h-4" />
          方案列表
        </Link>
        <div className="w-px h-6 bg-[#E9E9E9]" />
        <ArmchairIcon className="w-4 h-4" style={{ color: PARTY }} />
        <span className="text-sm font-semibold text-[#1A1A1A] truncate max-w-[260px]">{name || plan?.name || "新建会议"}</span>
        {plan && <span className="text-xs text-[#9CA3AF] hidden md:inline">{plan.roomName} · {plan.layoutName}</span>}
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[230px_1fr]">
        {/* 左 stepper */}
        <aside className="bg-white border-r border-[#E9E9E9] p-3 flex flex-col gap-1 overflow-auto">
          {STEPS.map((s, i) => {
            const skipped = s.n === 5 && realGroups.length === 0;
            const status = skipped ? "pending" : step === s.n ? "active" : step > s.n ? "done" : "pending";
            const desc = skipped ? "未分组 · 自动跳过" : s.desc;
            const Icon = s.icon;
            // 已建会议(非草稿)各步都可点击跳转查看;草稿态只第1步、跳过的第5步不可点
            const clickable = !isDraft && !skipped && status !== "active";
            return (
              <div key={s.n} className="relative">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && setStep(s.n)}
                  className={`w-full text-left flex items-start gap-2.5 rounded-lg p-2.5 transition-colors ${
                    status === "active"
                      ? "bg-party-soft border border-[var(--party-primary)]"
                      : clickable
                        ? "border border-transparent hover:bg-[#F7F8FA] cursor-pointer"
                        : "opacity-50 border border-transparent cursor-default"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                      status === "done"
                        ? "bg-green-500 text-white"
                        : status === "active"
                          ? "bg-[var(--party-primary)] text-white"
                          : "bg-[#E9E9E9] text-[#9CA3AF]"
                    }`}
                  >
                    {status === "done" ? <CheckIcon className="w-3.5 h-3.5" /> : s.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold flex items-center gap-1.5 ${status === "active" ? "text-[var(--party-primary)]" : "text-[#1A1A1A]"}`}>
                      <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">{desc}</div>
                  </div>
                </button>
                {i < STEPS.length - 1 && <div className="absolute left-[1.45rem] top-[2.7rem] w-px h-2 bg-[#E9E9E9]" />}
              </div>
            );
          })}
        </aside>

        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            {/* Step 1 会议信息 */}
            {step === 1 && (
              <div className="h-full overflow-auto p-6">
                <div className="max-w-2xl mx-auto space-y-4">
                  {/* AI 上传识别(下一阶段) */}
                  <div className="rounded-xl border border-dashed border-[#D8B4FE] bg-[#FAF5FF] p-4 flex items-center gap-3">
                    <FileTextIcon className="w-8 h-8 text-[#7C3AED] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1A1A]">上传会议通知 / 议程 / 名单,AI 自动识别</div>
                      <div className="text-[11px] text-[#9CA3AF] mt-0.5">识别会议名称、会场、起止时间、参会人数 —— 即将上线,先手填下方</div>
                    </div>
                    <AiButton disabled title="下一阶段开放" className="px-3 py-1.5 text-xs flex-shrink-0">
                      AI 识别
                    </AiButton>
                  </div>
                  {/* 会议信息卡 */}
                  <div className="bg-white rounded-xl border border-[#E9E9E9] p-5 space-y-4">
                    <div className="text-base font-bold text-[#1A1A1A]">会议信息</div>
                    <label className="block">
                      <span className="block text-xs text-[#6B7280] mb-1">会议名称 *</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="如:2026年七一表彰大会" />
                    </label>
                    {/* 会场点选 */}
                    <div>
                      <span className="block text-xs text-[#6B7280] mb-1">会场</span>
                      <button
                        onClick={() => setShowRoomPicker(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] hover:border-[var(--party-primary)] text-left"
                      >
                        <Building2Icon className="w-4 h-4 text-[var(--party-primary)] flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-[#1A1A1A]">{currentRoom ? currentRoom.name : "点选会场"}</span>
                        <span className="text-[11px] text-[#9CA3AF]">{currentRoom ? `容纳 ${currentRoom.capacity}` : "搜索 / 筛选"}</span>
                        <ChevronDownIcon className="w-4 h-4 text-[#9CA3AF]" />
                      </button>
                      <p className="text-[10px] text-[#9CA3AF] mt-1">选会场后,第 2 步在该会场里选座次图。</p>
                    </div>
                    {/* 时间 */}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-xs text-[#6B7280] mb-1">开始时间(默认 5 天后)</span>
                        <input
                          type="datetime-local"
                          value={meetingStart}
                          onChange={(e) => {
                            setMeetingStart(e.target.value);
                            setMeetingEnd(addMinutes(e.target.value, durationMin));
                          }}
                          className={INPUT}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-xs text-[#6B7280] mb-1">会议时长(分钟)</span>
                        <input
                          type="number"
                          min={0}
                          value={durationMin}
                          onChange={(e) => {
                            const d = Math.max(0, Number(e.target.value) || 0);
                            setDurationMin(d);
                            setMeetingEnd(addMinutes(meetingStart, d));
                          }}
                          className={INPUT}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="block text-xs text-[#6B7280] mb-1">结束时间(按「开始 + 时长」自动算,可手动改)</span>
                      <input type="datetime-local" value={meetingEnd} onChange={(e) => setMeetingEnd(e.target.value)} className={INPUT} />
                    </label>
                    {/* 参会人数 */}
                    <label className="block">
                      <span className="block text-xs text-[#6B7280] mb-1">参会人数</span>
                      <input
                        type="number"
                        min={0}
                        value={meetingHeadcount}
                        onChange={(e) => setMeetingHeadcount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0))}
                        className={INPUT}
                        placeholder="预计参会人数(用于座次图命名 / 以后荐会场)"
                      />
                      <span className="text-[11px] text-[#9CA3AF] mt-1 block">已导入名单 {roster.length} 人</span>
                    </label>
                    {/* 备注 */}
                    <label className="block">
                      <span className="block text-xs text-[#6B7280] mb-1">备注说明</span>
                      <textarea
                        value={meetingNote}
                        onChange={(e) => setMeetingNote(e.target.value)}
                        rows={3}
                        className={`${INPUT} resize-none`}
                        placeholder="会议须知 / 着装要求 / 其它说明"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 选座次图(不再选会议室,用第 1 步的会场;预制图复制使用 / 空白新建) */}
            {step === 2 && (
              <div className="h-full flex min-h-0">
                <main ref={mainRef} className="flex-1 overflow-auto p-6 flex items-center justify-center">
                  {step2State && <SeatingCanvas state={step2State} zoom={zoom} mode="arrange" />}
                </main>
                <aside className="w-80 flex-shrink-0 bg-white border-l border-[#E9E9E9] overflow-auto p-4 space-y-3">
                  <div className="text-sm font-bold text-[#1A1A1A]">选择座次图</div>
                  <div className="text-xs text-[#6B7280]">
                    会场:<span className="text-[#1A1A1A] font-medium">{currentRoom?.name ?? "未选(回第 1 步)"}</span>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                    {typeof meetingHeadcount === "number" && meetingHeadcount > 0
                      ? `已按参会 ${meetingHeadcount} 人推荐合适座次图(标「推荐」)。`
                      : "选一张该会场的预制图,或「空白座次图」。"}
                    点「下一步」进设计器微调:预制图自动复制一份(不动原图),空白图新建一张本会议专属。
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {/* 预制图卡(按参会人数自动命中最合适的一张,标「推荐」) */}
                    {roomLayouts.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setLayoutChoice(l.id)}
                        className={`rounded-lg border overflow-hidden text-left transition-colors ${
                          layoutChoice === l.id
                            ? "border-[var(--party-primary)] ring-1 ring-[var(--party-primary)]"
                            : "border-[#E9E9E9] hover:border-[var(--party-primary)]"
                        }`}
                        title={`选用「${l.name}」(下一步复制一份来改)`}
                      >
                        <div className="aspect-[3/2] bg-[#F7F8FA] flex items-center justify-center overflow-hidden">
                          {l.thumbnail ? (
                            <img src={l.thumbnail} alt={l.name} className="w-full h-full object-contain" />
                          ) : (
                            <LayoutGridIcon className="w-7 h-7 text-[#D1D5DB]" />
                          )}
                        </div>
                        <div className="px-1.5 py-1 text-[11px] text-[#1A1A1A] truncate">
                          {l.name}（{l.seatCount}座）
                          {bestFitLayoutId === l.id && <span className="text-[var(--party-primary)] font-medium"> · 推荐</span>}
                        </div>
                      </button>
                    ))}
                    {/* 空白座次图卡(放最后) */}
                    <button
                      onClick={() => setLayoutChoice("blank")}
                      className={`rounded-lg border overflow-hidden text-left transition-colors ${
                        layoutChoice === "blank"
                          ? "border-[var(--party-primary)] ring-1 ring-[var(--party-primary)]"
                          : "border-dashed border-[#D1D5DB] hover:border-[var(--party-primary)]"
                      }`}
                    >
                      <div className="aspect-[3/2] bg-[#F7F8FA] flex items-center justify-center text-[#9CA3AF]">
                        <PlusIcon className="w-7 h-7" />
                      </div>
                      <div className="px-1.5 py-1 text-[11px] text-[#1A1A1A] truncate">空白座次图(从零画)</div>
                    </button>
                  </div>
                  {roomLayouts.length === 0 && (
                    <div className="text-[11px] text-[#9CA3AF]">该会场暂无预制座次图,可选「空白座次图」新建。</div>
                  )}
                  <div className="pt-2 border-t border-[#F0F0F0] text-xs text-[#6B7280]">
                    当前座次图:<span className="text-[var(--party-primary)] font-medium">{plan.layoutName}</span>
                  </div>
                </aside>
              </div>
            )}

            {/* Step 3 编辑座次图:内嵌设计器内核(微调桌椅/座位/主席台),下一步自动保存 */}
            {step === 3 && layoutId && (
              <div className="h-full">
                <VenueLayoutEditor
                  ref={editorRef}
                  layoutId={layoutId}
                  embedded
                  defaultMeetingName={name || plan?.name}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["venue", "plan", planId] })}
                />
              </div>
            )}

            {/* Step 4 导入人员 */}
            {step === 4 && (
              <div className="h-full p-5 min-h-0">
                <RosterEditor planId={planId!} roster={roster} onChange={setRoster} />
              </div>
            )}

            {/* Step 5 分区与占座 */}
            {step === 5 && (
              <div className="h-full flex min-h-0">
                <main ref={mainRef} className="flex-1 overflow-auto p-6 flex items-center justify-center relative">
                  {selectedGroupForDraw && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-[var(--party-primary)] text-white text-xs shadow-md">
                      在座次图上拖出「{selectedGroupForDraw}」的区域
                    </div>
                  )}
                  {anchorMode && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-[#DC2626] text-white text-xs shadow-md">
                      在座次图上点一下,设为「中心参照点」
                    </div>
                  )}
                  {layoutState && (
                    <SeatingCanvas
                      state={layoutState}
                      zoom={zoom}
                      zones={zonesForView}
                      anchor={effectiveAnchor}
                      mode={anchorMode ? "setAnchor" : selectedGroupForDraw ? "drawZone" : "arrange"}
                      onDrawZone={onDrawZone}
                      onSetAnchor={setAnchorAt}
                    />
                  )}
                </main>
                <aside className="w-80 flex-shrink-0 bg-white border-l border-[#E9E9E9] overflow-auto p-4 space-y-3">
                  <div className="text-sm font-bold text-[#1A1A1A]">给每个组划一片区域</div>
                  <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                    点一个组 → 在左侧座次图上拖出矩形,框住给该组坐的座位。一个组一片区。(特殊占座:记者/来宾区将在下一阶段加)
                  </p>
                  {/* 中心参照点(尊位基准) */}
                  <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] flex-shrink-0" />
                      <span className="font-bold text-[#1A1A1A]">中心参照点</span>
                      <span className="text-[#9CA3AF]">当前:{anchorSrc}</span>
                    </div>
                    <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
                      排座以它为尊位基准(越近越尊)。默认按 主席台 → 会议桌 → 最前排中央 自动定;可手动点。
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedGroupForDraw(null);
                          setAnchorMode((v) => !v);
                        }}
                        className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                          anchorMode ? "bg-[#DC2626] text-white" : "border border-[#DC2626] text-[#DC2626] hover:bg-[#FEE2E2]"
                        }`}
                      >
                        {anchorMode ? "点图中…(取消)" : "在图上点选中心"}
                      </button>
                      {anchorOverride && (
                        <button onClick={resetAnchor} className="px-2 py-1 rounded text-xs border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]">
                          恢复自动
                        </button>
                      )}
                    </div>
                  </div>
                  {realGroups.length === 0 && (
                    <div className="p-2.5 rounded-lg bg-[#FEF3C7] text-[#92400E] text-xs flex gap-2">
                      <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      名单还没分组,请回第 4 步分组。
                    </div>
                  )}
                  {realGroups.length > 1 && (
                    <p className="text-[10px] text-[#9CA3AF]">↕ 拖动组卡调整排座优先级:靠上 = 先排(区域重叠时先占座)。</p>
                  )}
                  <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={onGroupDragEnd}>
                    <SortableContext items={realGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {realGroups.map((g, i) => (
                          <SortableGroupRow
                            key={g.id}
                            id={g.id}
                            index={i}
                            count={g.attendees.length}
                            color={groupColorMap.get(g.id)}
                            hasZone={!!groupZoneMap[g.id]}
                            picking={selectedGroupForDraw === g.id}
                            onPick={() => {
                              setAnchorMode(false);
                              setSelectedGroupForDraw(selectedGroupForDraw === g.id ? null : g.id);
                            }}
                            onClear={() => clearGroupZone(g.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </aside>
              </div>
            )}

            {/* Step 6 排座 */}
            {step === 6 && (
              <div className="h-full flex min-h-0">
                <main ref={mainRef} className="flex-1 overflow-auto p-6 flex items-center justify-center">
                  {layoutState && (
                    <SeatingCanvas
                      state={layoutState}
                      zoom={zoom}
                      zones={zonesForView}
                      anchor={effectiveAnchor}
                      seatFill={seatFill}
                      seatLabel={seatLabel}
                      lockedSeatIds={lockedSeatIds}
                      selectedSeatId={selectedSeatId}
                      mode="arrange"
                      onSeatClick={(id) => {
                        if (pickedAttendeeId) {
                          placeAttendee(pickedAttendeeId, id);
                          return;
                        }
                        setSelectedSeatId((c) => (c === id ? null : id));
                      }}
                      onSwap={onSwap}
                      onDropToSeat={(id) => {
                        const aid = draggingAttendeeRef.current;
                        draggingAttendeeRef.current = null;
                        if (aid) placeAttendee(aid, id);
                      }}
                    />
                  )}
                </main>
                <aside className="w-80 flex-shrink-0 bg-white border-l border-[#E9E9E9] overflow-auto">
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
                      按「组 → 区域」对号入座,组内名单顺序越靠前越坐尊位。排好后可拖动座位换人;未排上的也可拖到空座。
                    </p>
                  </div>
                  <div className="p-4 border-b border-[#F0F0F0]">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[#1A1A1A] font-bold">
                        已排 {stats.seated}
                        <span className="text-[#9CA3AF] font-normal"> / {stats.total} 人</span>
                      </span>
                      {stats.unseated.length > 0 && <span className="text-[#EF4444] text-xs">未排 {stats.unseated.length}</span>}
                    </div>
                    <div className="mt-2 space-y-1">
                      {realGroups.length === 0 && (
                        <div className="text-xs text-[#9CA3AF]">未分组 · 全场按名单顺序排座(距主席台近者靠前)</div>
                      )}
                      {realGroups.map((g) => {
                        const seated = g.attendees.filter((p) => assignments.some((a) => a.attendeeId === p.id)).length;
                        return (
                          <div key={g.id} className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: groupColorMap.get(g.id) }} />
                            <span className="text-[#6B7280] truncate flex-1 min-w-0">{g.id}</span>
                            <span className="text-[#9CA3AF] flex-shrink-0">{seated}/{g.attendees.length}{groupZoneMap[g.id] ? "" : " · 未划区"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                        <>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-[var(--party-primary)] font-medium">{selectedAssign.attendeeName}</span>
                            {selectedAssign.special && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#CCFBF1] text-[#0F766E] font-medium">{selectedAssign.special}</span>
                            )}
                            {selectedAssign.unit && <span className="text-[11px] text-[#9CA3AF] truncate">{selectedAssign.unit}</span>}
                            {selectedAssign.position && <span className="text-[11px] text-[#9CA3AF]">{selectedAssign.position}</span>}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => toggleLock(selectedSeat.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] ${
                                selectedAssign.locked
                                  ? "bg-[#FEF3C7] text-[#B45309]"
                                  : "text-[#6B7280] border border-[#E9E9E9] hover:bg-[#F7F8FA]"
                              }`}
                              title={selectedAssign.locked ? "已锁定:重新一键排座不动。点击解锁" : "锁定此座:重新一键排座保持不变"}
                            >
                              {selectedAssign.locked ? <LockIcon className="w-3 h-3" /> : <LockOpenIcon className="w-3 h-3" />}
                              {selectedAssign.locked ? "已锁定" : "锁定"}
                            </button>
                            <button onClick={() => removeFromSeat(selectedSeat.id)} className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#EF4444] hover:bg-[#FEE2E2]">
                              <UserXIcon className="w-3 h-3" />移除
                            </button>
                          </div>
                        </>
                      ) : reservedSeatIds.includes(selectedSeat.id) ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-[#B45309] font-medium">已预留(自动排跳过)</span>
                          <button onClick={() => toggleReserve(selectedSeat.id)} className="ml-auto px-2 py-1 rounded text-[11px] text-[#6B7280] border border-[#E9E9E9] hover:bg-[#F7F8FA]">
                            取消预留
                          </button>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-[#9CA3AF]">空座(可拖人进来)</span>
                          <button onClick={() => toggleReserve(selectedSeat.id)} className="ml-auto px-2 py-1 rounded text-[11px] text-[#6B7280] border border-[#E9E9E9] hover:bg-[#F7F8FA]">
                            预留此座
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {stats.unseated.length > 0 && (
                    <div className="p-4">
                      <div className="text-xs font-bold text-[#EF4444] mb-1">未排上 {stats.unseated.length} 人</div>
                      <div className="text-[10px] text-[#9CA3AF] mb-2">含特殊人员(来宾/记者…,标 [类别])与座位不够的人。点姓名→点座次图空座即放入(放入即锁定)。</div>
                      {pickedUnseated && (
                        <div className="mb-2 p-2 rounded-lg border border-[var(--party-primary)] bg-party-soft">
                          <div className="text-sm font-bold text-[var(--party-primary)]">{pickedUnseated.name}</div>
                          <div className="text-[11px] text-[#6B7280] mt-0.5">
                            {pickedUnseated.unit || "未填单位"}
                            {pickedUnseated.position ? ` · ${pickedUnseated.position}` : ""}
                          </div>
                          <div className="text-[10px] text-[#9CA3AF] mt-1">→ 点座次图上的空座位即可放入</div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {stats.unseated.slice(0, 60).map((p) => {
                          const picked = pickedAttendeeId === p.id;
                          return (
                            <button
                              key={p.id}
                              draggable
                              onDragStart={() => {
                                draggingAttendeeRef.current = p.id;
                                setPickedAttendeeId(p.id);
                              }}
                              onClick={() => setPickedAttendeeId((c) => (c === p.id ? null : p.id))}
                              className={`px-2 py-0.5 rounded text-xs cursor-grab active:cursor-grabbing ${
                                picked ? "bg-[var(--party-primary)] text-white" : "bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2]"
                              }`}
                              title="点选后点空座位放入,或直接拖到座位上"
                            >
                              {p.name}
                              {p.special && <span className={picked ? "text-white/90" : "text-[#0F766E]"}> [{p.special}]</span>}
                              {!p.group && !p.special && <span className={picked ? "text-white/80" : "text-[#F59E0B]"}> (未分组)</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            )}

            {/* Step 7 生成与导出 */}
            {step === 7 && (
              <div className="h-full overflow-auto p-6">
                <div className="max-w-4xl mx-auto space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-[#1A1A1A]">生成与导出</h2>
                    <p className="text-sm text-[#9CA3AF] mt-0.5">
                      {exportSubtitle} · 已排座 {stats.seated}/{stats.total} 人
                      {stats.unseated.length > 0 && `(${stats.unseated.length} 人未排上)`}
                    </p>
                  </div>

                  {/* 座位安排图 */}
                  <div className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#F0F0F0] flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <ImageIcon className="w-4 h-4 flex-shrink-0" style={{ color: PARTY }} />
                        <span className="text-sm font-bold text-[#1A1A1A]">座位安排图</span>
                        <span className="text-[11px] text-[#9CA3AF] truncate hidden sm:inline">带人名 + 分组配色,贴会场门口 / 发群通知</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => exportImage("png")} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          {exportBusy === "image-png" ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5" />}
                          PNG
                        </button>
                        <button onClick={() => exportImage("pdf")} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          {exportBusy === "image-pdf" ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5" />}
                          PDF
                        </button>
                      </div>
                    </div>
                    <div className="p-4 bg-[#F7F8FA] flex items-center justify-center min-h-[240px]">
                      {exportPreview ? (
                        <img src={exportPreview} alt="座位安排图" className="max-w-full max-h-[440px] object-contain rounded shadow-sm bg-white" />
                      ) : (
                        <div className="text-sm text-[#9CA3AF] flex items-center gap-2">
                          <Loader2Icon className="w-4 h-4 animate-spin" />
                          生成预览…
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 表格 / 桌签 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-[#E9E9E9] p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <FileSpreadsheetIcon className="w-4 h-4 flex-shrink-0" style={{ color: PARTY }} />
                        <span className="text-sm font-bold text-[#1A1A1A]">座位安排表</span>
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mb-3 flex-1">每人座位明细(按入座顺序),核对 / 存档</p>
                      <div className="flex items-center gap-2">
                        <button onClick={printArrangement} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          <PrinterIcon className="w-3.5 h-3.5" />
                          打印 / PDF
                        </button>
                        <button onClick={() => downloadExcel("arrangement")} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          {exportBusy === "xlsx-arrangement" ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5" />}
                          Excel
                        </button>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-[#E9E9E9] p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <ContactIcon className="w-4 h-4 flex-shrink-0" style={{ color: PARTY }} />
                        <span className="text-sm font-bold text-[#1A1A1A]">桌签</span>
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mb-3 flex-1">对折桌签(A4 两枚/页),摆放台面</p>
                      <div className="flex items-center gap-2">
                        <button onClick={exportDeskCards} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          {exportBusy === "desk" ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5" />}
                          下载 PDF
                        </button>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-[#E9E9E9] p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <FileTextIcon className="w-4 h-4 flex-shrink-0" style={{ color: PARTY }} />
                        <span className="text-sm font-bold text-[#1A1A1A]">签到表</span>
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mb-3 flex-1">全部与会人员(含未排座),现场签到</p>
                      <div className="flex items-center gap-2">
                        <button onClick={printSignin} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          <PrinterIcon className="w-3.5 h-3.5" />
                          打印 / PDF
                        </button>
                        <button onClick={() => downloadExcel("signin")} disabled={exportBusy !== null} className={EXPORT_BTN}>
                          {exportBusy === "xlsx-signin" ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5" />}
                          Excel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 缩放条(画布步) */}
          {CANVAS_STEPS.includes(step) && (
            <div className="relative">
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-white border border-[#E9E9E9] rounded-full shadow-md px-1.5 py-1 text-[#6B7280]">
                <button onClick={() => setZoom((z) => clampZoom(z - 0.1))} className="p-1.5 rounded-full hover:bg-[#F7F8FA]">
                  <ZoomOutIcon className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(1)} className="min-w-[46px] px-1 py-1 rounded text-xs font-medium tabular-nums hover:bg-[#F7F8FA]">
                  {Math.round(zoom * 100)}%
                </button>
                <button onClick={() => setZoom((z) => clampZoom(z + 0.1))} className="p-1.5 rounded-full hover:bg-[#F7F8FA]">
                  <ZoomInIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-[#E9E9E9] mx-0.5" />
                <button onClick={() => setZoom(computeFitZoom())} className="p-1.5 rounded-full hover:bg-[#F7F8FA]">
                  <MaximizeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 底部导航 */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-[#E9E9E9] bg-white">
            <div className="text-[11px] text-[#9CA3AF]">
              {step === 1
                ? "填写会议信息"
                : step === 2
                  ? "选图后「下一步」进设计器"
                  : step === 3
                    ? "微调座次图 · 下一步自动保存"
                    : step === 4
                      ? `已录入 ${roster.length} 人 · ${realGroups.length} 组`
                      : step === 5
                        ? `${Object.keys(groupZoneMap).length}/${realGroups.length} 个组已划区`
                        : step === 6
                          ? `已排 ${stats.seated} / ${stats.total} 人`
                          : "排座已保存"}
            </div>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button onClick={goPrev} disabled={navBusy} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA] disabled:opacity-50">
                  <ChevronLeftIcon className="w-4 h-4" />上一步
                </button>
              )}
              {step === 6 && (
                <button
                  onClick={() => saveAssignMut.mutate()}
                  disabled={saveAssignMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft disabled:opacity-50"
                >
                  <SaveIcon className="w-4 h-4" />
                  {saveAssignMut.isPending ? "保存中…" : "保存排座"}
                </button>
              )}
              {step < 7 && (
                <button
                  onClick={() => void goNext()}
                  disabled={navBusy}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: PARTY }}
                >
                  {navBusy ? "保存中…" : "下一步"}
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              )}
              {step === 7 && (
                <button
                  onClick={() => navigate("/admin/venue/seating")}
                  className="px-4 py-1.5 rounded text-sm font-medium text-white"
                  style={{ backgroundColor: PARTY }}
                >
                  完成
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showRoomPicker && (
        <RoomPicker
          rooms={rooms}
          value={effectiveRoomId}
          onSelect={(id) => setPickRoomId(id)}
          onClose={() => setShowRoomPicker(false)}
        />
      )}
    </div>
  );
}
