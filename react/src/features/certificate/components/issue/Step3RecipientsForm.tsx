/**
 * 证书发证向导 V3 — Step 3 单 record 受表彰对象录入面板。
 *
 * 用法:每条 HonorRecord 对应一个 Step3RecipientsForm 实例(由 wizard 容器按
 * subStepIdx 一次只渲染一个)。组件按 `record.honorType` 分支:
 *   - collective:集体名表格 + 批量粘贴
 *   - individual:粘贴文本 → 识别 → 表格 + 员工号 lookup 部门 + 状态徽章
 *
 * 视觉:顶部 header band 整条用蓝(集体)/橙(个人)淡背景 + 圆 icon 强化氛围;
 * 主区按类型渲染对应表格。
 */

import { useState } from "react";
import {
  Building2Icon,
  UsersIcon,
  PlusIcon,
  XIcon,
  ClipboardListIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ScanLineIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  newCollectiveRow,
  newPersonRow,
  type CollectiveRow,
  type HonorRecord,
  type PersonRow,
} from "../../lib/certificateDraft";
import { parsePersonLines } from "../../lib/parsePersonLines";
import type { CertificateTemplateDto } from "../../api";
import { usersApi } from "@/features/user";

/**
 * 通用:按换行切 + 去空行(兼容 \r\n)。
 * 集体批量粘贴 + 个人粘贴预览都用,避免 split 写法不一致(原 /\n/ 在 Windows
 * CRLF 下会残留 \r 给后续 trim,虽然 trim 能盖掉但写法不一致是隐患)。
 */
function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

interface Step3RecipientsFormProps {
  record: HonorRecord;
  template?: CertificateTemplateDto;
  onRecordChange: (record: HonorRecord) => void;
  recordIndex: number;
  totalRecords: number;
}

export function Step3RecipientsForm({
  record,
  template,
  onRecordChange,
  recordIndex,
  totalRecords,
}: Step3RecipientsFormProps) {
  return (
    <div>
      <HeaderBand
        record={record}
        template={template}
        recordIndex={recordIndex}
        totalRecords={totalRecords}
      />
      {record.honorType === "collective" ? (
        <CollectiveEditor record={record} onRecordChange={onRecordChange} />
      ) : (
        <IndividualEditor record={record} onRecordChange={onRecordChange} />
      )}
    </div>
  );
}

/* ─── 顶部 Header Band ─── */

function HeaderBand({
  record,
  template,
  recordIndex,
  totalRecords,
}: {
  record: HonorRecord;
  template?: CertificateTemplateDto;
  recordIndex: number;
  totalRecords: number;
}) {
  const isCollective = record.honorType === "collective";
  const colorClass = isCollective
    ? "bg-blue-50 border-blue-200"
    : "bg-orange-50 border-orange-200";
  const iconWrapClass = isCollective
    ? "bg-blue-100 text-blue-700"
    : "bg-orange-100 text-orange-700";
  const chipClass = isCollective
    ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-orange-100 text-orange-700 border-orange-200";
  return (
    <div className={`mb-4 p-3 rounded-lg border ${colorClass}`}>
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconWrapClass}`}
        >
          {isCollective ? (
            <Building2Icon className="w-5 h-5" />
          ) : (
            <UsersIcon className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-base font-bold text-[#1A1A1A] truncate"
              title={record.honorName || template?.name || "未命名"}
            >
              {record.honorName || template?.name || "未命名"}
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-semibold border ${chipClass}`}
            >
              {isCollective ? "集体" : "个人"}
            </span>
          </div>
          <div className="text-[11px] text-[#6B7280] mt-1">
            第 {recordIndex + 1} / {totalRecords} 条
            {template?.honorCode && (
              <span className="ml-2 font-mono text-[#9CA3AF]">
                [{template.honorCode}]
              </span>
            )}
            {template && (
              <span className="ml-2 text-[#9CA3AF]">模板:{template.name}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 集体编辑器 ─── */

function CollectiveEditor({
  record,
  onRecordChange,
}: {
  record: HonorRecord;
  onRecordChange: (record: HonorRecord) => void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  function patchCollective(crid: string, patch: Partial<CollectiveRow>) {
    onRecordChange({
      ...record,
      collectives: record.collectives.map((c) =>
        c.rid === crid ? { ...c, ...patch } : c,
      ),
    });
  }

  function addCollective() {
    onRecordChange({
      ...record,
      collectives: [...record.collectives, newCollectiveRow()],
    });
  }

  function removeCollective(crid: string) {
    onRecordChange({
      ...record,
      collectives: record.collectives.filter((c) => c.rid !== crid),
    });
  }

  function applyBulk() {
    const lines = splitNonEmptyLines(bulkText);
    if (lines.length === 0) return;
    onRecordChange({
      ...record,
      collectives: [
        ...record.collectives.filter((c) => c.name.trim()),
        ...lines.map((name) => newCollectiveRow({ name })),
      ],
    });
    setBulkText("");
    setBulkOpen(false);
  }

  const bulkPreviewCount = splitNonEmptyLines(bulkText).length;
  const validCount = record.collectives.filter((c) => c.name.trim()).length;

  return (
    <div>
      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA]">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-2 py-2 text-left w-12">#</th>
              <th className="px-2 py-2 text-left">
                被表彰单位 / 集体名称 *
              </th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {record.collectives.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-2 py-6 text-center text-[#9CA3AF] text-xs"
                >
                  还没有录入 —— 点底部「+ 添加一行」或「批量粘贴」开始
                </td>
              </tr>
            )}
            {record.collectives.map((c, i) => (
              <tr key={c.rid}>
                <td className="px-2 py-1 text-[#9CA3AF] font-mono">
                  {i + 1}
                </td>
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <Building2Icon className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) =>
                        patchCollective(c.rid, { name: e.target.value })
                      }
                      placeholder="如「机关党支部」/「青年突击队」/「先进基层党组织(机关综合处)」"
                      className="flex-1 px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                    />
                  </div>
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeCollective(c.rid)}
                    className="p-1 rounded text-[#9CA3AF] hover:text-red-600"
                    title="删除此行"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-2 py-2 border-t border-[#F0F0F0] bg-[#FAFAFB] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={addCollective}
              className="flex items-center gap-1 text-[11px] text-[var(--party-primary)] hover:underline"
            >
              <PlusIcon className="w-3 h-3" />
              添加一行
            </button>
            <span className="w-px h-3 bg-[#E9E9E9]" />
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[var(--party-primary)] hover:underline"
            >
              <ClipboardListIcon className="w-3 h-3" />
              {bulkOpen ? "收起批量粘贴" : "批量粘贴(每行 1 个)"}
            </button>
          </div>
          <span className="text-[10px] text-[#9CA3AF]">
            有效:{validCount} / {record.collectives.length}
          </span>
        </div>
      </div>

      {bulkOpen && (
        <div className="mt-3 p-3 rounded-lg bg-white border border-[#E9E9E9]">
          <div className="text-[11px] text-[#6B7280] mb-2">
            把名单粘进来,每行 1 个(空行自动忽略)。会
            <span className="font-semibold text-[#1A1A1A]">追加</span>
            到已有列表后面,不覆盖。
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            placeholder={
              "机关党支部\n青年突击队\n第二联络部党支部\n后勤保障党小组"
            }
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBulkText("");
                setBulkOpen(false);
              }}
              className="px-3 py-1 text-xs rounded border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={applyBulk}
              disabled={bulkPreviewCount === 0}
              className="px-3 py-1 text-xs rounded text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              追加 {bulkPreviewCount} 项
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 个人编辑器 ─── */

function IndividualEditor({
  record,
  onRecordChange,
}: {
  record: HonorRecord;
  onRecordChange: (record: HonorRecord) => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);

  function patchPerson(rid: string, patch: Partial<PersonRow>) {
    onRecordChange({
      ...record,
      persons: record.persons.map((p) =>
        p.rid === rid ? { ...p, ...patch } : p,
      ),
    });
  }

  function addPerson() {
    onRecordChange({
      ...record,
      persons: [...record.persons, newPersonRow()],
    });
  }

  function removePerson(rid: string) {
    onRecordChange({
      ...record,
      persons: record.persons.filter((p) => p.rid !== rid),
    });
  }

  async function recognize() {
    const parsed = parsePersonLines(pasteText);
    if (parsed.length === 0) {
      toast.error("粘贴内容里没解析到任何人,请检查格式");
      return;
    }
    setBusy(true);
    try {
      // 拿出需要去库里查的 empNo(去重 + 非空)
      const empNos = Array.from(
        new Set(parsed.map((p) => p.empNo).filter(Boolean)),
      );
      let lookup: Awaited<ReturnType<typeof usersApi.lookupByEmpNo>> = {};
      if (empNos.length > 0) {
        try {
          lookup = await usersApi.lookupByEmpNo(empNos);
        } catch {
          toast.warning(
            "员工号批量查询失败,所有行按「库中暂无」状态保留 — 仍可手填部门继续发证",
          );
        }
      }
      const newPersons: PersonRow[] = parsed.map((p) => {
        const hit = p.empNo ? lookup[p.empNo] : null;
        return newPersonRow({
          // 命中库优先用库里的姓名(更规范),否则用粘贴的姓名
          name: hit?.name ?? p.name,
          empNo: p.empNo,
          dept: hit?.adminOrgName ?? hit?.partyOrgName ?? "",
          userId: hit?.id,
          found: Boolean(hit),
        });
      });
      onRecordChange({
        ...record,
        persons: [...record.persons, ...newPersons],
      });
      setPasteText("");
      const hits = newPersons.filter((p) => p.found).length;
      const misses = newPersons.length - hits;
      if (misses === 0) {
        toast.success(`已识别 ${newPersons.length} 人,全部命中库`);
      } else {
        toast.success(
          `已识别 ${newPersons.length} 人,${hits} 命中 / ${misses} 暂无(可手填部门保留)`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // 只数行(非空)即可,无需触发完整的 name/empNo 解析
  const pastePreviewCount = splitNonEmptyLines(pasteText).length;
  const validCount = record.persons.filter((p) => p.name.trim()).length;

  return (
    <div>
      {/* 粘贴区 */}
      <div className="rounded-lg border border-[#E9E9E9] bg-white p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-[#6B7280]">
            粘贴名单,每行 1 人 — 空格 / Tab / 逗号(中英都行)分隔
            <span className="font-mono mx-1">姓名</span>和
            <span className="font-mono mx-1">员工编号</span>。顺序无所谓,
            3 位以上纯数字识别为员工号。
          </div>
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
          placeholder={"张三  10001\n李四,20003\n10005  王五\n赵六 30002 综合处(职务/备注会被忽略)"}
          className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-[#9CA3AF]">
            预解析到 {pastePreviewCount} 行
          </span>
          <button
            type="button"
            onClick={recognize}
            disabled={!pasteText.trim() || busy}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {busy ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ScanLineIcon className="w-3.5 h-3.5" />
            )}
            识别 + 回填部门
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA]">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left">姓名 *</th>
              <th className="px-2 py-2 text-left w-28">员工编号</th>
              <th className="px-2 py-2 text-left">部门</th>
              <th className="px-2 py-2 w-24">状态</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {record.persons.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-2 py-6 text-center text-[#9CA3AF] text-xs"
                >
                  还没有录入 —— 上方粘贴名单后点「识别」,或点底部「+ 添加一行」手填
                </td>
              </tr>
            )}
            {record.persons.map((p, i) => (
              <tr key={p.rid}>
                <td className="px-2 py-1 text-[#9CA3AF] font-mono">
                  {i + 1}
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) =>
                      patchPerson(p.rid, { name: e.target.value })
                    }
                    placeholder="姓名"
                    className="w-full px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={p.empNo}
                    onChange={(e) =>
                      // 手动改 empNo → 该行视为未匹配,清掉 found + userId 防止误绑
                      patchPerson(p.rid, {
                        empNo: e.target.value,
                        found: false,
                        userId: undefined,
                      })
                    }
                    placeholder="可选"
                    className="w-full px-1.5 py-1 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={p.dept}
                    onChange={(e) =>
                      patchPerson(p.rid, { dept: e.target.value })
                    }
                    placeholder="可选(命中库会自动填)"
                    className="w-full px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <MatchBadge found={p.found} hasEmpNo={Boolean(p.empNo)} />
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removePerson(p.rid)}
                    className="p-1 rounded text-[#9CA3AF] hover:text-red-600"
                    title="删除此行"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-2 py-2 border-t border-[#F0F0F0] bg-[#FAFAFB] flex items-center justify-between">
          <button
            type="button"
            onClick={addPerson}
            className="flex items-center gap-1 text-[11px] text-[var(--party-primary)] hover:underline"
          >
            <PlusIcon className="w-3 h-3" />
            添加一行
          </button>
          <span className="text-[10px] text-[#9CA3AF]">
            共 {record.persons.length} 人,{validCount} 个有姓名
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 个人行状态徽章:库匹配优先,其次有员工号但库里没人,最次手填。
 * 用 early-return 替代嵌套三元(对齐项目规范)。
 */
function MatchBadge({ found, hasEmpNo }: { found: boolean; hasEmpNo: boolean }) {
  if (found) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2Icon className="w-3 h-3" />
        已匹配
      </span>
    );
  }
  if (hasEmpNo) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
        <AlertCircleIcon className="w-3 h-3" />
        库中暂无
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]">
      手填
    </span>
  );
}
