/**
 * PaginationBar — 底部分页条(每页条数 + 页码窗口 + 跳页)。
 * 从 Users.tsx 抽出共用:用户管理表格 / 角色页「关联用户」成员列表(member 角色 2 万+成员)。
 */
import { useState } from "react";

const PARTY = "var(--party-primary)";

/** 页码窗口:首尾 + 当前页 ±1,间隔用省略号(如 1 2 … 41 42 43 … 416 417) */
function pageWindow(current: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, 2, pages - 1, pages, current - 1, current, current + 1]);
  const list = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of list) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export function PaginationBar({
  total, skip, take, onPageChange, onTakeChange,
}: {
  total: number;
  skip: number;
  take: number;
  /** 传新的 skip(条数偏移) */
  onPageChange: (skip: number) => void;
  onTakeChange: (take: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / take));
  const current = Math.min(pages, Math.floor(skip / take) + 1);
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(total, skip + take);
  const [jumpInput, setJumpInput] = useState("");

  function jump() {
    const n = parseInt(jumpInput, 10);
    if (!Number.isFinite(n)) return;
    const page = Math.min(pages, Math.max(1, n));
    onPageChange((page - 1) * take);
    setJumpInput("");
  }

  return (
    <div className="flex-shrink-0 px-4 py-2 border-t border-[#E9E9E9] bg-white flex items-center gap-3 flex-wrap text-xs text-[#6B7280]">
      <span>
        第 {from}–{to} 条 · 共 {total} 人
      </span>

      <div className="flex-1" />

      <label className="flex items-center gap-1.5">
        每页
        <select
          value={take}
          onChange={(e) => onTakeChange(parseInt(e.target.value, 10))}
          className="px-1.5 py-1 rounded border border-[#E9E9E9] bg-white"
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        人
      </label>

      <div className="flex items-center gap-1">
        <button
          disabled={current <= 1}
          onClick={() => onPageChange((current - 2) * take)}
          className="px-2 py-1 rounded border border-[#E9E9E9] disabled:opacity-40 hover:bg-[#F7F8FA]"
        >
          上一页
        </button>
        {pageWindow(current, pages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-[#D1D5DB]">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange((p - 1) * take)}
              className="min-w-[28px] px-1.5 py-1 rounded border text-center"
              style={
                p === current
                  ? { backgroundColor: PARTY, borderColor: PARTY, color: "white", fontWeight: 600 }
                  : { borderColor: "#E9E9E9" }
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          disabled={current >= pages}
          onClick={() => onPageChange(current * take)}
          className="px-2 py-1 rounded border border-[#E9E9E9] disabled:opacity-40 hover:bg-[#F7F8FA]"
        >
          下一页
        </button>
      </div>

      {pages > 5 && (
        <label className="flex items-center gap-1.5">
          跳至
          <input
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && jump()}
            placeholder={`1-${pages}`}
            className="w-16 px-1.5 py-1 rounded border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)]"
          />
          页
          <button
            onClick={jump}
            disabled={!jumpInput}
            className="px-2 py-1 rounded border border-[#E9E9E9] disabled:opacity-40 hover:bg-[#F7F8FA]"
          >
            跳转
          </button>
        </label>
      )}
    </div>
  );
}
