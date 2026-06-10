import type { Attendee } from "../api";
import type { VenueDesignerState, SeatElement } from "./venueTypes";

/** 排座结果一行(座位 → 人);与 SeatingPlan.assignments 同形 */
export interface PlanAssign {
  seatId: string;
  attendeeId?: string | null;
  attendeeName?: string;
  unit?: string;
  position?: string;
  group?: string;
}

export interface ExportPerson {
  name: string;
  unit?: string;
  position?: string;
}

export interface SeatRow {
  // index signature:使本类型可直接喂给 printTable 的 Record<string,string|number> 行参数
  [k: string]: string | number;
  seq: number;
  seat: string;
  name: string;
  unit: string;
  position: string;
  group: string;
}

/** 座位的视觉「位置」标签:优先完整定位名(X排Y号),退座号 */
function seatPosLabel(s: SeatElement): string {
  return (s.name ?? "").trim() || (s.seatNo ?? "").trim() || "";
}

/**
 * 按座位视觉顺序(从前到后排、排内左到右)列出**已排到人**的座位。
 * 排序:y 相差超过半排(14px)算不同排、先上后下;同排按 x 左到右。
 */
export function buildSeatingRows(state: VenueDesignerState, assignments: PlanAssign[]): SeatRow[] {
  const seats = state.elements.filter((e): e is SeatElement => e.type === "seat");
  const aBySeat = new Map(assignments.map((a) => [a.seatId, a]));
  const sorted = [...seats].sort((s1, s2) =>
    Math.abs(s1.y - s2.y) > 14 ? s1.y - s2.y : s1.x - s2.x,
  );
  const rows: SeatRow[] = [];
  for (const s of sorted) {
    const a = aBySeat.get(s.id);
    if (!a?.attendeeId || !a.attendeeName) continue;
    rows.push({
      seq: rows.length + 1,
      seat: seatPosLabel(s),
      name: a.attendeeName,
      unit: a.unit ?? "",
      position: a.position ?? "",
      group: a.group ?? "",
    });
  }
  return rows;
}

/** 已排座的人 → 桌签数据(按座位顺序;桌签摆台顺序即入座顺序) */
export function buildDeskCardPeople(
  state: VenueDesignerState,
  assignments: PlanAssign[],
): ExportPerson[] {
  return buildSeatingRows(state, assignments).map((r) => ({
    name: r.name,
    unit: r.unit,
    position: r.position,
  }));
}

export interface SigninRow {
  [k: string]: string | number;
  seq: number;
  name: string;
  unit: string;
  position: string;
  group: string;
}

/** 签到表行:按名单顺序列出**全部**与会人(含未排座者) */
export function buildSigninRows(roster: Attendee[]): SigninRow[] {
  return roster
    .filter((p) => p.name?.trim())
    .map((p, i) => ({
      seq: i + 1,
      name: p.name,
      unit: p.unit ?? "",
      position: p.position ?? "",
      group: p.group ?? "",
    }));
}

interface PrintCol {
  key: string;
  label: string;
  width?: string;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ESC[c]);

/**
 * 开新窗口写一张可打印的 HTML 表格并触发打印(浏览器打印对话框可「另存为 PDF」)。
 * 中文用系统字体完美呈现,零依赖、不受 jsPDF 字体限制。
 * 返回 false = 弹窗被拦截(调用方可提示)。
 */
export function printTable(opts: {
  title: string;
  subtitle?: string;
  columns: PrintCol[];
  rows: Record<string, string | number>[];
}): boolean {
  const { title, subtitle, columns, rows } = opts;
  const thead = columns.map((c) => `<th${c.width ? ` style="width:${c.width}"` : ""}>${esc(c.label)}</th>`).join("");
  const tbody = rows.length
    ? rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" class="empty">(无数据)</td></tr>`;
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", system-ui, sans-serif; color: #1A1A1A; margin: 24px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #6B7280; font-size: 13px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #B0B0B0; padding: 7px 10px; text-align: center; }
  th { background: #F3F4F6; font-weight: 700; }
  tbody tr:nth-child(even) td { background: #FAFAFA; }
  td.empty { color: #9CA3AF; padding: 24px; }
  @media print {
    body { margin: 12mm; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  }
</style></head><body>
<h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print();},120);};</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
