import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, Trash2Icon, FolderIcon, FolderPlusIcon, PencilIcon } from "lucide-react";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";
import type { Attendee } from "../api";
import {
  buildGroups,
  flattenGroups,
  removeGroup,
  renameGroup,
  UNGROUPED,
  PRESET_GROUPS,
  type RosterGroup,
} from "../lib/rosterGroups";

const ROW_INPUT =
  "px-1.5 py-0.5 text-sm rounded border border-transparent hover:border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

/**
 * 名单分组拖拽画布:每组一个容器,组内拖拽排序、跨组拖动;越靠前优先级越高。
 * 结构变更(拖拽/删组/改组)上抛 onChange(已 flatten 的 roster) → 父组件实时保存 + 算分;
 * 单元格编辑走 onPatchRow(本地,父用保存按钮存)。
 */
export function RosterGroups({
  roster,
  emptyGroups,
  onChange,
  onEmptyGroupsChange,
  onPatchRow,
  onDeleteRow,
}: {
  roster: Attendee[];
  emptyGroups: string[];
  onChange: (roster: Attendee[]) => void;
  onEmptyGroupsChange: (groups: string[]) => void;
  onPatchRow: (id: string, patch: Partial<Attendee>) => void;
  onDeleteRow: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // shift 范围选:记上次点击的人作锚点,再按住 shift 点另一人 → 选中两者之间(按显示顺序)全部
  const lastClickedRef = useRef<string | null>(null);
  const groups = buildGroups(roster, emptyGroups);

  // 默认分组改字典驱动(venue_roster_group):管理员在「字典管理」里增删改即改快捷建组按钮。
  // 字典未加载/为空时回退到 PRESET_GROUPS 常量,保证未 reseed 也能用。
  const groupDictQuery = useQuery({
    queryKey: ["dictionary", DICT_CODES.VENUE_ROSTER_GROUP],
    queryFn: () => dictionariesApi.get(DICT_CODES.VENUE_ROSTER_GROUP),
    staleTime: 5 * 60 * 1000,
  });
  const presetGroups = useMemo(() => {
    const items = (groupDictQuery.data?.items ?? []).filter((i) => i.active).map((i) => i.label);
    return items.length ? items : PRESET_GROUPS;
  }, [groupDictQuery.data]);

  // 特殊人员类别字典(venue_special_type):来宾/记者/列席…;字典未 seed 时回退常量
  const specialDictQuery = useQuery({
    queryKey: ["dictionary", DICT_CODES.VENUE_SPECIAL_TYPE],
    queryFn: () => dictionariesApi.get(DICT_CODES.VENUE_SPECIAL_TYPE),
    staleTime: 5 * 60 * 1000,
  });
  const specialTypes = useMemo(() => {
    const items = (specialDictQuery.data?.items ?? []).filter((i) => i.active).map((i) => i.label);
    return items.length ? items : ["来宾", "记者", "列席", "工作人员"];
  }, [specialDictQuery.data]);

  // 勾选框点击:普通点 = toggle 单个;按住 Shift 点 = 选中「上次点的人 → 这次点的人」之间
  // 全部(按显示顺序的扁平列表,可跨组),免去一个一个点。
  function onSelectClick(id: string, shiftKey: boolean) {
    const flatIds = groups.flatMap((g) => g.attendees.map((a) => a.id));
    // 锚点必须在「更新 ref 之前」捕获到局部变量:setSelectedIds 的 updater 延迟到渲染阶段才执行,
    // 若在 updater 内读 lastClickedRef,会读到已被本次点击覆盖成 id 的新值 → anchor===id 恒成立、
    // 范围选永远失效。捕获后立即更新 ref,updater 闭包用捕获的 anchor。
    const anchor = lastClickedRef.current;
    lastClickedRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor && anchor !== id) {
        const i1 = flatIds.indexOf(anchor);
        const i2 = flatIds.indexOf(id);
        if (i1 >= 0 && i2 >= 0) {
          const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
          for (let k = lo; k <= hi; k++) next.add(flatIds[k]);
          return next; // shift 范围选只增不减
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // 组标题勾选框:整组全选 / 全不选
  function setGroupSelected(ids: string[], select: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    // 批量:拖的是已勾选的之一且勾了多个 → 移动整组勾选;否则只移动它
    const movingIds = new Set(
      selectedIds.has(activeId) && selectedIds.size > 1 ? [...selectedIds] : [activeId],
    );
    if (movingIds.has(overId)) return; // 拖到自己集合内,忽略

    const gs = buildGroups(roster, emptyGroups);
    const moving = roster.filter((a) => movingIds.has(a.id)); // 保持原顺序
    if (moving.length === 0) return;
    for (const g of gs) g.attendees = g.attendees.filter((a) => !movingIds.has(a.id));

    let to = gs.findIndex((g) => g.id === overId);
    let toIdx = 0;
    if (to >= 0) {
      toIdx = gs[to].attendees.length; // 落容器空白 → 末尾
    } else {
      gs.forEach((g, gi) => {
        const i = g.attendees.findIndex((a) => a.id === overId);
        if (i >= 0) {
          to = gi;
          toIdx = i;
        }
      });
    }
    if (to < 0) return;

    gs[to].attendees.splice(toIdx, 0, ...moving);
    const targetId = gs[to].id;
    if (targetId !== UNGROUPED) onEmptyGroupsChange(emptyGroups.filter((x) => x !== targetId));
    onChange(flattenGroups(gs));
    if (movingIds.size > 1) setSelectedIds(new Set());
  }

  function addGroup(preset?: string) {
    const n = (preset ?? window.prompt("分组名称(如 机关组):") ?? "").trim();
    if (!n) return;
    if (groups.some((g) => g.id === n)) return; // 同名组已存在
    onEmptyGroupsChange([...emptyGroups, n]);
  }
  function doRename(oldId: string) {
    const n = (window.prompt("改组名:", oldId) ?? "").trim();
    if (!n || n === oldId) return;
    onChange(renameGroup(roster, oldId, n));
    onEmptyGroupsChange(emptyGroups.map((x) => (x === oldId ? n : x)));
  }
  function doDelete(id: string) {
    onChange(removeGroup(roster, id));
    onEmptyGroupsChange(emptyGroups.filter((x) => x !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-[#9CA3AF]">分组:拖人进组、组内拖排序,越靠前优先级越高;勾选可批量拖(按住 Shift 点可范围多选、点组标题框可整组选)</span>
        <div className="flex-1" />
        {presetGroups.filter((g) => !groups.some((x) => x.id === g)).map((g) => (
          <button
            key={g}
            onClick={() => addGroup(g)}
            className="px-2.5 py-1 rounded-lg text-xs border border-[#E9E9E9] text-[#6B7280] hover:bg-white"
          >
            + {g}
          </button>
        ))}
        <button
          onClick={() => addGroup()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-[#E9E9E9] text-[#6B7280] hover:bg-white"
        >
          <FolderPlusIcon className="w-3.5 h-3.5" />
          自定义分组
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              selectedIds={selectedIds}
              specialTypes={specialTypes}
              onSelectClick={onSelectClick}
              onSetGroupSelected={setGroupSelected}
              onRename={doRename}
              onDelete={doDelete}
              onPatchRow={onPatchRow}
              onDeleteRow={onDeleteRow}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function GroupSection({
  group: g,
  selectedIds,
  specialTypes,
  onSelectClick,
  onSetGroupSelected,
  onRename,
  onDelete,
  onPatchRow,
  onDeleteRow,
}: {
  group: RosterGroup;
  selectedIds: Set<string>;
  specialTypes: string[];
  onSelectClick: (id: string, shiftKey: boolean) => void;
  onSetGroupSelected: (ids: string[], select: boolean) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onPatchRow: (id: string, patch: Partial<Attendee>) => void;
  onDeleteRow: (id: string) => void;
}) {
  const isUng = g.id === UNGROUPED;
  const { setNodeRef, isOver } = useDroppable({ id: g.id });
  const ids = g.attendees.map((a) => a.id);
  const allSel = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const someSel = ids.some((id) => selectedIds.has(id));

  return (
    <div className={`rounded-lg border ${isUng ? "border-[#E9E9E9] bg-white" : "border-[#dbe6f5] bg-[#f7faff]"}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#eef2fb]">
        <input
          type="checkbox"
          checked={allSel}
          ref={(el) => {
            if (el) el.indeterminate = !allSel && someSel;
          }}
          onChange={() => onSetGroupSelected(ids, !allSel)}
          disabled={ids.length === 0}
          className="flex-shrink-0 accent-[var(--party-primary)] disabled:opacity-30"
          title={allSel ? "取消全选本组" : "全选本组"}
        />
        <FolderIcon className={`w-4 h-4 ${isUng ? "text-[#9CA3AF]" : "text-[#246BFE]"}`} />
        <span className="text-sm font-bold text-[#1A1A1A]">{isUng ? "未分组" : g.id}</span>
        <span className="text-[11px] text-[#9CA3AF]">{g.attendees.length} 人</span>
        {!isUng && (
          <>
            <button onClick={() => onRename(g.id)} className="p-1 rounded text-[#9CA3AF] hover:text-[#246BFE]" title="改组名">
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(g.id)} className="p-1 rounded text-[#9CA3AF] hover:text-red-600" title="删组(人移到未分组)">
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      <SortableContext items={g.attendees.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`p-2 space-y-1 min-h-[48px] rounded-b-lg ${isOver ? "bg-party-soft/50" : ""}`}>
          {g.attendees.map((a, i) => (
            <PersonRow
              key={a.id}
              a={a}
              rank={i + 1}
              selected={selectedIds.has(a.id)}
              specialTypes={specialTypes}
              onSelectClick={onSelectClick}
              onPatch={onPatchRow}
              onDelete={onDeleteRow}
            />
          ))}
          {g.attendees.length === 0 && (
            <div className="text-[12px] text-[#9CA3AF] text-center py-2 border border-dashed border-[#E5E7EB] rounded">
              把人拖进来
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function PersonRow({
  a,
  rank,
  selected,
  specialTypes,
  onSelectClick,
  onPatch,
  onDelete,
}: {
  a: Attendee;
  rank: number;
  selected: boolean;
  specialTypes: string[];
  onSelectClick: (id: string, shiftKey: boolean) => void;
  onPatch: (id: string, patch: Partial<Attendee>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-2 rounded px-2 py-1 border ${
        selected ? "border-[var(--party-primary)] bg-party-soft/40" : "border-[#E9E9E9] bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onSelectClick(a.id, e.shiftKey);
        }}
        className="flex-shrink-0 accent-[var(--party-primary)]"
        title="勾选(按住 Shift 点可范围多选);勾中后可批量拖动"
      />
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[#C0C6D0] hover:text-[#6B7280] touch-none flex-shrink-0"
        title="拖动排序 / 换组(勾选多人可整组拖)"
      >
        <GripVerticalIcon className="w-4 h-4" />
      </button>
      <span className="text-xs text-[#9CA3AF] w-5 text-center flex-shrink-0">{rank}</span>
      <input
        value={a.name}
        onChange={(e) => onPatch(a.id, { name: e.target.value })}
        placeholder="姓名"
        className={`${ROW_INPUT} w-20 flex-shrink-0`}
      />
      <input
        value={a.unit ?? ""}
        onChange={(e) => onPatch(a.id, { unit: e.target.value })}
        placeholder="单位"
        className={`${ROW_INPUT} flex-1 min-w-0`}
      />
      <input
        value={a.position ?? ""}
        onChange={(e) => onPatch(a.id, { position: e.target.value })}
        placeholder="职务"
        className={`${ROW_INPUT} w-24 flex-shrink-0`}
      />
      {/* 工号区固定宽度且始终渲染(无工号时空占位),保证有/无工号的行「职务」列对齐 */}
      <span
        className="text-[10px] text-[#9CA3AF] flex-shrink-0 w-14 text-right truncate"
        title={a.empNo ? `员工编号 ${a.empNo}` : "无员工编号"}
      >
        {a.empNo ?? ""}
      </span>
      {/* 特殊人员标记:标记后不参与自动排座,在排座页手动指定座位 */}
      <select
        value={a.special ?? ""}
        onChange={(e) => onPatch(a.id, { special: e.target.value || undefined })}
        onClick={(e) => e.stopPropagation()}
        title="标记特殊人员(来宾/记者…):标记后不参与自动排座,在排座页手动指定座位并锁定"
        className={`text-[10px] rounded border px-1 py-0.5 flex-shrink-0 w-16 focus:outline-none ${
          a.special
            ? "border-[#14B8A6] bg-[#CCFBF1] text-[#0F766E] font-medium"
            : "border-[#E9E9E9] text-[#9CA3AF]"
        }`}
      >
        <option value="">普通</option>
        {specialTypes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        onClick={() => onDelete(a.id)}
        className="p-1 rounded hover:bg-[#FEE2E2] text-[#EF4444] flex-shrink-0"
        title="删除"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
