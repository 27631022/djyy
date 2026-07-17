/**
 * 候选人点选器 —— 「姓名(+单位)」命中多人时,由用户亲自确认是哪一个。
 *
 * 为什么必须人工点选(不做自动 tie-break):
 *   库里 20842 人中 3638 人重名(最多 25 人同名);加上表彰文件里的单位前缀后
 *   仍有 326 人多义(如「云贵分公司」下有 2 个聂伟)。而发证时后端会用 User 快照
 *   **覆盖**证书上的姓名/工号 —— 一旦绑错,证书正面直接烤成另一个人,发证人在
 *   UI 上看不出任何差异。所以系统绝不替用户猜身份。
 *
 * 分辨「哪个聂伟」的唯一有效信息是**全称路径**,故路径必须显眼。
 */

import { useState } from "react";
import { AlertCircleIcon, CheckIcon, UserIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import type { PersonCandidate, PersonRow } from "../../lib/certificateDraft";

interface CandidatePickerProps {
  row: PersonRow;
  onPick: (c: PersonCandidate) => void;
}

export function CandidatePicker({ row, onPick }: CandidatePickerProps) {
  const [open, setOpen] = useState(false);
  const candidates = row.candidates ?? [];
  if (candidates.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="姓名命中多人,请点选确认是哪一位"
          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
        >
          <AlertCircleIcon className="w-3 h-3" />
          {candidates.length} 人同名 · 点选
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b border-[#F0F0F0]">
          <div className="text-xs font-semibold text-[#1A1A1A]">
            选择「{row.name}」是哪一位
          </div>
          <div className="text-[10px] text-[#9CA3AF] mt-0.5">
            {row.orgHint
              ? `文件写的单位:${row.orgHint} — 已按该单位收敛,仍有多人同名`
              : "未提供单位 — 下方为全部同名在职人员"}
          </div>
        </div>

        {row.candidatesTruncated && (
          <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-800">
            同名过多,仅显示前 {candidates.length} 人。建议补充单位或直接填写员工编号。
          </div>
        )}

        <div className="max-h-64 overflow-y-auto divide-y divide-[#F5F5F5]">
          {candidates.map((c) => (
            <button
              key={c.userId}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#F7F8FA] group"
            >
              <div className="flex items-center gap-2">
                <UserIcon className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
                <span className="text-xs font-medium text-[#1A1A1A]">{c.name}</span>
                <span className="text-[10px] font-mono text-[#6B7280]">
                  {c.empNo}
                </span>
                <CheckIcon className="w-3 h-3 ml-auto text-transparent group-hover:text-[var(--party-primary)]" />
              </div>
              {/* 全称路径 = 分辨同名者的唯一有效信息,必须显眼 */}
              <div
                className="mt-0.5 pl-5 text-[10px] text-[#6B7280] break-all"
                title={c.deptPath || undefined}
              >
                {c.deptPath || (
                  <span className="text-[#9CA3AF]">
                    (无行政归属{c.partyOrgName ? ` · 党组织:${c.partyOrgName}` : ""})
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="px-3 py-1.5 border-t border-[#F0F0F0] bg-[#FAFAFB] text-[10px] text-[#9CA3AF]">
          都不是?关掉此框,手工填写员工编号即可。
        </div>
      </PopoverContent>
    </Popover>
  );
}
