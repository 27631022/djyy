import { useRef, useState } from "react";
import { toast } from "sonner";
import { Calculator, Download, Upload, X } from "lucide-react";
import { downloadBlob } from "@/shared/lib/download";
import { targetRef, type AssessmentTarget, type DifficultyTable } from "../api";
import { coefForCount, DEFAULT_HEADCOUNT_TABLE, tableSummary } from "../difficulty";
import { DifficultyEditor } from "./DifficultyEditor";

const INPUT =
  "px-2 py-1 text-[13px] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

const BOM = String.fromCharCode(0xfeff);

/**
 * 难易系数配置弹窗(按指标):导出考核单位 → 填员工数上传 → 按测算表自动算系数 → 手动微调。
 * 系数是「每个指标 × 每个单位」的具体值,管理端和基层都能直观看到。
 * 测算表(人数→系数)与员工数存考核表设置(共享);系数存本指标(叶子)。
 */
export function DifficultyCoefDialog({
  open,
  onClose,
  indicatorLabel,
  targets,
  tables,
  onTables,
  headcounts,
  onHeadcounts,
  coefs,
  onCoefs,
}: {
  open: boolean;
  onClose: () => void;
  indicatorLabel: string;
  targets: AssessmentTarget[];
  tables: DifficultyTable[];
  onTables: (t: DifficultyTable[]) => void;
  headcounts: Record<string, number>;
  onHeadcounts: (h: Record<string, number>) => void;
  coefs: Record<string, number>;
  onCoefs: (c: Record<string, number>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [applyId, setApplyId] = useState<string>("");
  if (!open) return null;

  const applyTable = tables.find((t) => t.id === applyId) ?? tables[0] ?? DEFAULT_HEADCOUNT_TABLE;

  const setHeadcount = (ref: string, raw: string) => {
    const next = { ...headcounts };
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) delete next[ref];
    else next[ref] = n;
    onHeadcounts(next);
  };
  const setCoef = (ref: string, raw: string) => {
    const next = { ...coefs };
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) delete next[ref];
    else next[ref] = n;
    onCoefs(next);
  };
  const recompute = (hc: Record<string, number> = headcounts) => {
    const next = { ...coefs };
    let n = 0;
    for (const t of targets) {
      const ref = targetRef(t);
      const v = hc[ref];
      if (typeof v === "number" && Number.isFinite(v)) {
        next[ref] = coefForCount(applyTable, v);
        n += 1;
      }
    }
    onCoefs(next);
    return n;
  };

  const doExport = () => {
    const rows: (string | number)[][] = [
      ["单位名称", "员工数"],
      ...targets.map((t) => [t.name, headcounts[targetRef(t)] ?? ""]),
    ];
    const csv = BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `难易系数-员工数模板.csv`);
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const byName = new Map<string, number>();
      for (const { name, count } of parseCsv(text)) byName.set(name, count);
      const nextHc = { ...headcounts };
      let matched = 0;
      for (const t of targets) {
        const c = byName.get(t.name.trim());
        if (typeof c === "number" && Number.isFinite(c)) {
          nextHc[targetRef(t)] = c;
          matched += 1;
        }
      }
      onHeadcounts(nextHc);
      const n = recompute(nextHc);
      toast.success(`已导入 ${matched} 个单位员工数,自动测算 ${n} 个系数;可再手动微调`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败,请确认是 CSV 文件");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-[760px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-[#eef2f7]">
          <Calculator className="w-4 h-4 text-[var(--party-primary)]" />
          <div className="font-semibold text-[#172033] text-[15px]">难易系数 · {indicatorLabel}</div>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="p-1 rounded text-[#9CA3AF] hover:bg-[#eef2f7]">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="overflow-auto p-4 space-y-4 min-h-0">
          {/* 测算表(辅助手段):人数→系数 */}
          <div className="rounded-lg border border-[#eef2f7] p-3">
            <DifficultyEditor tables={tables} onChange={onTables} />
          </div>

          {/* 导出 / 导入员工数 + 测算 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={doExport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] border border-[#dce4ef] text-[#475467] hover:bg-[#eef2f7]"
            >
              <Download className="w-4 h-4" /> 导出考核单位
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) doImport(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] border border-[#dce4ef] text-[#475467] hover:bg-[#eef2f7]"
            >
              <Upload className="w-4 h-4" /> 导入员工数
            </button>
            {tables.length > 1 && (
              <select value={applyId} onChange={(e) => setApplyId(e.target.value)} className={INPUT}>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => {
                const n = recompute();
                toast.success(n ? `已按员工数测算 ${n} 个系数` : "还没有员工数,请先导入或填写");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] text-white"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              <Calculator className="w-4 h-4" /> 按员工数测算系数
            </button>
          </div>
          <div className="text-[11px] text-[#9CA3AF] -mt-2">
            导出 → Excel 填「员工数」→ 另存为 CSV → 导入,系统按上表测算系数({tableSummary(applyTable)});再手动微调。
          </div>

          {/* 各单位:员工数 + 系数 */}
          <div className="border border-[#eef2f7] rounded-md overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#f6f8fb] text-[11px] text-[#6B7280] font-medium">
              <span className="w-6 flex-shrink-0">#</span>
              <span className="flex-1">考核对象</span>
              <span className="w-24 flex-shrink-0 text-right">员工数</span>
              <span className="w-20 flex-shrink-0 text-right">难易系数</span>
            </div>
            <div className="max-h-[40vh] overflow-auto">
              {targets.length === 0 ? (
                <div className="text-center text-[12px] text-[#9CA3AF] py-6">请先在「考核表设置」选好考核对象</div>
              ) : (
                targets.map((t, i) => {
                  const ref = targetRef(t);
                  return (
                    <div key={ref} className="flex items-center gap-2 px-2.5 py-1 border-t border-[#f1f5f9]">
                      <span className="w-6 flex-shrink-0 text-[12px] text-[#9CA3AF]">{i + 1}</span>
                      <span className="flex-1 text-[13px] text-[#374151] truncate" title={t.name}>
                        {t.name}
                      </span>
                      <input
                        type="number"
                        placeholder="—"
                        value={headcounts[ref] ?? ""}
                        onChange={(e) => setHeadcount(ref, e.target.value)}
                        className={`${INPUT} w-24 text-right`}
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="1"
                        value={coefs[ref] ?? ""}
                        onChange={(e) => setCoef(ref, e.target.value)}
                        className={`${INPUT} w-20 text-right font-medium`}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="text-[11px] text-[#9CA3AF] -mt-2">系数留空 = 默认 1。测算:本指标得分 × 该单位系数,再排名/汇总。</div>
        </div>

        <footer className="flex justify-end gap-2 px-4 py-3 border-t border-[#eef2f7]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ─── CSV 辅助 ─── */

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') q = true;
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): { name: string; count: number }[] {
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  const lines = body.split(/\r?\n/);
  const out: { name: string; count: number }[] = [];
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const cells = splitCsvLine(line);
    const name = (cells[0] ?? "").trim();
    const count = Number((cells[1] ?? "").trim());
    if (!name) return;
    if (idx === 0 && !Number.isFinite(count)) return; // 跳过表头行
    if (Number.isFinite(count)) out.push({ name, count });
  });
  return out;
}
