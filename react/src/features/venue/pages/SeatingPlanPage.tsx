import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  SaveIcon,
  UploadIcon,
  ArmchairIcon,
  UserCheckIcon,
  LayoutGridIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { seatingApi, roomApi, layoutApi, venueAiApi, type Attendee } from "../api";
import { parseRosterLines } from "../lib/parseRosterLines";
import { assignScores } from "../lib/rosterGroups";
import { AiButton } from "@/shared/components/AiButton";
import { RosterGroups } from "../components/RosterGroups";
import { usersApi } from "@/features/user";

const PARTY = "var(--party-primary)";
const INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

export default function SeatingPlanPage() {
  const { planId } = useParams<{ planId: string }>();
  const qc = useQueryClient();
  const planQuery = useQuery({
    queryKey: ["venue", "plan", planId],
    queryFn: () => seatingApi.get(planId!),
    enabled: !!planId,
  });

  const [name, setName] = useState("");
  const [roster, setRoster] = useState<Attendee[]>([]);
  const [emptyGroups, setEmptyGroups] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteParsed, setPasteParsed] = useState<Omit<Attendee, "id">[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showChangeLayout, setShowChangeLayout] = useState(false);

  useEffect(() => {
    if (!planQuery.data) return;
    // 外部数据同步到本地编辑态(非级联渲染)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(planQuery.data.name);
    setRoster(planQuery.data.roster);
  }, [planQuery.data]);

  /** 保存(接 roster 参数,顺序算分后存) */
  const saveMut = useMutation({
    mutationFn: (r: Attendee[]) =>
      seatingApi.update(planId!, { name: name.trim() || "未命名方案", roster: assignScores(r) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue", "plan", planId] });
      qc.invalidateQueries({ queryKey: ["venue", "plans"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /** 结构变更(拖拽/删/录入)→ 本地更新 + 实时保存 */
  function persist(next: Attendee[]) {
    setRoster(next);
    saveMut.mutate(next);
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const r = await seatingApi.importRoster(planId!, file);
      persist(r.roster);
      toast.success(`导入 ${r.count} 人`);
      void enrichByEmpNo(r.roster);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  function patchRow(id: string, patch: Partial<Attendee>) {
    // 单元格编辑:本地改,点「保存」存(不每字符请求)
    setRoster((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function delRow(id: string) {
    persist(roster.filter((a) => a.id !== id));
  }
  function applyPaste(rows: Omit<Attendee, "id">[], mode: "append" | "replace") {
    const base = mode === "replace" ? [] : roster;
    const added: Attendee[] = rows.map((r, i) => ({ ...r, id: `p_${base.length + i}_${i}` }));
    const merged = [...base, ...added];
    persist(merged);
    setPasteText("");
    setPasteParsed([]);
    toast.success(mode === "replace" ? `已替换为 ${rows.length} 人` : `已追加 ${rows.length} 人`);
    void enrichByEmpNo(merged);
  }

  /** 工号补全:有 empNo 的行查系统用户,回填姓名/单位(工号优先);职务表无,保留原值 */
  async function enrichByEmpNo(src?: Attendee[]) {
    const r = src ?? roster;
    const empNos = [...new Set(r.filter((a) => a.empNo && a.empNo.trim()).map((a) => a.empNo!.trim()))];
    if (empNos.length === 0) {
      if (!src) toast.info("名单里没有员工编号");
      return;
    }
    try {
      const map = await usersApi.lookupByEmpNo(empNos);
      let hit = 0;
      const next = r.map((a) => {
        const e = a.empNo?.trim();
        if (!e) return a;
        const u = map[e];
        if (!u) return a;
        hit++;
        return { ...a, name: u.name || a.name, unit: u.adminOrgName || u.partyOrgName || a.unit };
      });
      persist(next);
      if (!src) toast.success(`已按工号补全 ${hit} 人`);
    } catch {
      toast.error("工号补全失败,保留原值");
    }
  }

  function doParse() {
    const rawCount = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
    const rows = parseRosterLines(pasteText);
    if (rows.length === 0) {
      toast.error(
        rawCount > 0
          ? "没解析到人员:每行需有姓名(只有工号的行会跳过)。请补上姓名,或用「AI 识别」"
          : "粘贴框是空的",
      );
      return;
    }
    setPasteParsed(rows);
    const skipped = rawCount - rows.length;
    if (skipped > 0) {
      toast.info(`解析出 ${rows.length} 人;${skipped} 行因只有工号、缺姓名已跳过`);
    }
  }
  async function doAi() {
    const t = pasteText.trim();
    if (t.length < 2) {
      toast.error("先粘贴名单内容");
      return;
    }
    setAiLoading(true);
    try {
      const r = await venueAiApi.extractRoster(t);
      setPasteParsed(
        r.roster.map((a) => ({
          name: a.name,
          empNo: a.empNo,
          unit: a.unit,
          position: a.position,
          group: a.group,
        })),
      );
      toast.success(`AI 识别出 ${r.count} 人`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 识别失败");
    } finally {
      setAiLoading(false);
    }
  }

  if (planQuery.isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">加载中…</div>;
  }
  if (planQuery.isError || !planQuery.data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3AF]">
        选座方案不存在或已删除
        <Link to="/admin/venue/seating" className="text-[var(--party-primary)] hover:underline">
          返回列表
        </Link>
      </div>
    );
  }
  const plan = planQuery.data;

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-shrink-0">
        <Link to="/admin/venue/seating" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]">
          <ArrowLeftIcon className="w-4 h-4" />
          返回
        </Link>
        <div className="w-px h-6 bg-[#E9E9E9]" />
        <ArmchairIcon className="w-4 h-4" style={{ color: PARTY }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 max-w-md px-2 py-1.5 text-sm rounded border border-transparent hover:border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          placeholder="方案名称"
        />
        <button
          onClick={() => setShowChangeLayout(true)}
          title="点击更换会场图"
          className="hidden md:flex items-center gap-1.5 text-xs text-[#6B7280] px-2.5 py-1.5 rounded-lg border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-party-soft transition-colors"
        >
          <LayoutGridIcon className="w-3.5 h-3.5" />
          {plan.roomName} · {plan.layoutName}
          <RefreshCwIcon className="w-3 h-3 opacity-60" />
        </button>
        <div className="flex-1" />
        <Link
          to={`/admin/venue/seating/${planId}/arrange`}
          title="进入排座:组→区域映射 + 一键排座 + 拖动微调"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft"
        >
          <ArmchairIcon className="w-4 h-4" />
          排座
        </Link>
        <button
          onClick={() => saveMut.mutate(roster)}
          disabled={saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: PARTY }}
        >
          <SaveIcon className="w-4 h-4" />
          {saveMut.isPending ? "保存中…" : "保存"}
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 左:录入名单(常驻) */}
        <aside className="w-[340px] flex-shrink-0 bg-white border-r border-[#E9E9E9] overflow-auto p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-[#1A1A1A]">录入名单</div>

          <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft cursor-pointer">
            <UploadIcon className="w-4 h-4" />
            {importing ? "导入中…" : "上传 Excel / CSV"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = "";
              }}
            />
          </label>

          <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
            <div className="flex-1 h-px bg-[#F0F0F0]" />
            或 粘贴录入
            <div className="flex-1 h-px bg-[#F0F0F0]" />
          </div>

          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"从 Excel/微信/Word 复制名单,一行一人:\n张三\t机关党委\t部长\n李四,基层一公司,科员\n王五"}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono resize-none"
          />
          <div className="flex gap-2">
            <button onClick={doParse} className="flex-1 px-2 py-2 rounded-lg text-sm border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]">
              按列解析
            </button>
            <AiButton onClick={() => void doAi()} disabled={aiLoading} className="flex-1 px-2 py-2 text-sm">
              {aiLoading ? "识别中…" : "AI 识别"}
            </AiButton>
          </div>
          <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
            「按列解析」:姓名·单位·职务 按顺序(Tab/逗号/空格分隔);列顺序乱用「AI 识别」。优先级由右侧拖拽顺序决定,不用填分。
          </p>

          {pasteParsed.length > 0 && (
            <div className="border border-[#E9E9E9] rounded-lg overflow-hidden">
              <div className="px-2 py-1 bg-[#FAFAFA] text-[11px] text-[#6B7280]">解析出 {pasteParsed.length} 人</div>
              <div className="max-h-40 overflow-auto">
                {pasteParsed.slice(0, 30).map((r, i) => (
                  <div key={i} className="px-2 py-1 text-xs border-b border-[#F7F8FA] last:border-0 truncate">
                    <span className="font-medium text-[#1A1A1A]">{r.name}</span>
                    {r.unit ? ` · ${r.unit}` : ""}
                    {r.position ? ` · ${r.position}` : ""}
                    {r.empNo ? <span className="text-[#9CA3AF]"> · 工号{r.empNo}</span> : null}
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 p-2 border-t border-[#F0F0F0]">
                <button
                  onClick={() => applyPaste(pasteParsed, "append")}
                  className="flex-1 px-2 py-1.5 rounded text-xs border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft"
                >
                  追加
                </button>
                <button
                  onClick={() => applyPaste(pasteParsed, "replace")}
                  className="flex-1 px-2 py-1.5 rounded text-xs text-white"
                  style={{ backgroundColor: PARTY }}
                >
                  替换名单
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] pt-1">
            <div className="flex-1 h-px bg-[#F0F0F0]" />
            或 按工号补全
            <div className="flex-1 h-px bg-[#F0F0F0]" />
          </div>
          <button
            onClick={() => void enrichByEmpNo()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]"
          >
            <UserCheckIcon className="w-4 h-4" />
            按工号补全姓名 / 单位
          </button>
        </aside>

        {/* 右:名单分组(拖拽定序,实时保存) */}
        <main className="flex-1 min-w-0 overflow-auto p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-sm font-bold text-[#1A1A1A]">名单</div>
            <div className="text-xs text-[#9CA3AF]">共 {roster.length} 人</div>
            <div className="flex-1" />
            <span className="text-[11px] text-[#9CA3AF]">拖拽自动保存</span>
            {roster.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("清空名单?")) persist([]);
                }}
                className="px-3 py-1.5 rounded-lg text-sm border border-[#E9E9E9] text-[#EF4444] hover:bg-[#FEE2E2]"
              >
                清空
              </button>
            )}
          </div>

          {roster.length === 0 && emptyGroups.length === 0 ? (
            <div className="border border-dashed border-[#E9E9E9] rounded-xl p-12 text-center text-[#9CA3AF] bg-white">
              名单为空。左侧「上传 Excel/CSV」或「粘贴录入」导入,再拖拽分组、排顺序。
            </div>
          ) : (
            <RosterGroups
              roster={roster}
              emptyGroups={emptyGroups}
              onChange={persist}
              onEmptyGroupsChange={setEmptyGroups}
              onPatchRow={patchRow}
              onDeleteRow={delRow}
            />
          )}

          <p className="text-[11px] text-[#9CA3AF] mt-3">
            把人拖进「机关组 / 基层组 / 上台领奖组」,组内拖出先后(越前优先级越高)。系统按此顺序算分值,供 V2.3 排座引擎对号入座。
          </p>
        </main>
      </div>

      {showChangeLayout && (
        <ChangeLayoutModal
          planId={planId!}
          currentRoomId={plan.roomId}
          currentLayoutId={plan.layoutId}
          onClose={() => setShowChangeLayout(false)}
          onChanged={() => {
            setShowChangeLayout(false);
            qc.invalidateQueries({ queryKey: ["venue", "plan", planId] });
            qc.invalidateQueries({ queryKey: ["venue", "plans"] });
          }}
        />
      )}
    </div>
  );
}

/** 更换本方案绑定的会场图(换图后端会清空分区映射 + 排座结果并回草稿,名单保留) */
function ChangeLayoutModal({
  planId,
  currentRoomId,
  currentLayoutId,
  onClose,
  onChanged,
}: {
  planId: string;
  currentRoomId: string;
  currentLayoutId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const roomsQuery = useQuery({ queryKey: ["venue", "rooms"], queryFn: () => roomApi.list() });
  const [roomId, setRoomId] = useState(currentRoomId);
  const layoutsQuery = useQuery({
    queryKey: ["venue", "layouts", roomId],
    queryFn: () => layoutApi.list(roomId),
    enabled: !!roomId,
  });
  const [layoutId, setLayoutId] = useState(currentLayoutId);

  const mut = useMutation({
    mutationFn: () => seatingApi.update(planId, { layoutId }),
    onSuccess: () => {
      toast.success("已更换会场图");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "更换失败"),
  });

  const rooms = roomsQuery.data ?? [];
  const layouts = layoutsQuery.data ?? [];
  const changed = !!layoutId && layoutId !== currentLayoutId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-[#1A1A1A] mb-1">更换会场图</h2>
        <p className="text-xs text-[#9CA3AF] mb-4 leading-relaxed">
          为本选座方案重新选择一张会场图。更换后,已配置的分区映射与排座结果会被清空(名单保留)。
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-[#6B7280] mb-1">会议室</span>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setLayoutId("");
              }}
              className={INPUT}
            >
              <option value="">请选择会议室</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-[#6B7280] mb-1">会场图</span>
            <select value={layoutId} onChange={(e) => setLayoutId(e.target.value)} className={INPUT} disabled={!roomId}>
              <option value="">
                {roomId ? (layouts.length ? "请选择会场图" : "该会议室还没有会场图") : "先选会议室"}
              </option>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}({l.seatCount}座){l.id === currentLayoutId ? " · 当前" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!layoutId) {
                toast.error("请选择会场图");
                return;
              }
              if (!changed) {
                toast.info("与当前会场图相同");
                return;
              }
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-60"
            style={{ backgroundColor: PARTY }}
          >
            {mut.isPending ? "更换中…" : "确定更换"}
          </button>
        </div>
      </div>
    </div>
  );
}
