import { useState } from "react";
import { UploadIcon, UserCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { seatingApi, venueAiApi, type Attendee } from "../api";
import { parseRosterLines } from "../lib/parseRosterLines";
import { AiButton } from "@/shared/components/AiButton";
import { RosterGroups } from "./RosterGroups";
import { usersApi } from "@/features/user";

/**
 * 名单录入(受控):左「录入面板」(上传 Excel/CSV + 粘贴解析/AI + 工号补全)+ 右「分组拖拽」。
 * 任何变更通过 onChange 上抛扁平 roster,父组件决定保存时机。导入走后端 importRoster(planId)。
 */
export function RosterEditor({
  planId,
  roster,
  onChange,
}: {
  planId: string;
  roster: Attendee[];
  onChange: (roster: Attendee[]) => void;
}) {
  const [emptyGroups, setEmptyGroups] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteParsed, setPasteParsed] = useState<Omit<Attendee, "id">[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const r = await seatingApi.importRoster(planId, file);
      onChange(r.roster);
      toast.success(`导入 ${r.count} 人`);
      void enrichByEmpNo(r.roster);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }
  function patchRow(id: string, patch: Partial<Attendee>) {
    onChange(roster.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function delRow(id: string) {
    onChange(roster.filter((a) => a.id !== id));
  }
  function applyPaste(rows: Omit<Attendee, "id">[], mode: "append" | "replace") {
    const base = mode === "replace" ? [] : roster;
    const added: Attendee[] = rows.map((r, i) => ({ ...r, id: `p_${base.length + i}_${i}` }));
    const merged = [...base, ...added];
    onChange(merged);
    setPasteText("");
    setPasteParsed([]);
    toast.success(mode === "replace" ? `已替换为 ${rows.length} 人` : `已追加 ${rows.length} 人`);
    void enrichByEmpNo(merged);
  }
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
      onChange(next);
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
    if (skipped > 0) toast.info(`解析出 ${rows.length} 人;${skipped} 行因只有工号、缺姓名已跳过`);
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
        r.roster.map((a) => ({ name: a.name, empNo: a.empNo, unit: a.unit, position: a.position, group: a.group })),
      );
      toast.success(`AI 识别出 ${r.count} 人`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 识别失败");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 border border-[#E9E9E9] rounded-xl overflow-hidden bg-white">
      {/* 左:录入面板 */}
      <aside className="w-[330px] flex-shrink-0 border-r border-[#E9E9E9] overflow-auto p-4 flex flex-col gap-3 bg-[#FCFCFD]">
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
                style={{ backgroundColor: "var(--party-primary)" }}
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

      {/* 右:名单分组 */}
      <main className="flex-1 min-w-0 overflow-auto p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-sm font-bold text-[#1A1A1A]">名单分组</div>
          <div className="text-xs text-[#9CA3AF]">共 {roster.length} 人</div>
          <div className="flex-1" />
          {roster.length > 0 && (
            <button
              onClick={() => {
                if (confirm("清空名单?")) onChange([]);
              }}
              className="px-3 py-1.5 rounded-lg text-sm border border-[#E9E9E9] text-[#EF4444] hover:bg-[#FEE2E2]"
            >
              清空
            </button>
          )}
        </div>
        {roster.length === 0 && emptyGroups.length === 0 ? (
          <div className="border border-dashed border-[#E9E9E9] rounded-xl p-12 text-center text-[#9CA3AF]">
            名单为空。左侧「上传 Excel/CSV」或「粘贴录入」导入,再拖拽分组、排顺序。
          </div>
        ) : (
          <RosterGroups
            roster={roster}
            emptyGroups={emptyGroups}
            onChange={onChange}
            onEmptyGroupsChange={setEmptyGroups}
            onPatchRow={patchRow}
            onDeleteRow={delRow}
          />
        )}
        <p className="text-[11px] text-[#9CA3AF] mt-3">
          把人拖进各分组(默认分组可在「字典管理 · 会议名单默认分组」里改),组内拖出先后(越前优先级越高)。下一步给每个组在座次图上画一片区域。
        </p>
      </main>
    </div>
  );
}
