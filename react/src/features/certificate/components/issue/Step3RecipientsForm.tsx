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
import { useQuery } from "@tanstack/react-query";
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
import { buildOrgPath, findOrgByName } from "../../lib/orgPath";
import type { CertificateTemplateDto } from "../../api";
import { usersApi, OrgPicker } from "@/features/user";
import { organizationsApi, type OrgTreeNode } from "@/features/organization";

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
  // 行政机构树 —— 给「所在单位/部门」组织点选器用(缓存,跨 record 复用)
  const { data: orgTree = [] } = useQuery({
    queryKey: ["organizations", "tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 5 * 60 * 1000,
  });
  return (
    <div>
      <HeaderBand
        record={record}
        template={template}
        recordIndex={recordIndex}
        totalRecords={totalRecords}
      />
      {record.honorType === "collective" ? (
        <CollectiveEditor
          record={record}
          onRecordChange={onRecordChange}
          orgTree={orgTree}
        />
      ) : (
        <IndividualEditor
          record={record}
          onRecordChange={onRecordChange}
          orgTree={orgTree}
        />
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
  orgTree,
}: {
  record: HonorRecord;
  onRecordChange: (record: HonorRecord) => void;
  orgTree: OrgTreeNode[];
}) {
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
  }

  /** 按集体名在组织树里匹配所在单位:精确则填,模糊则填并标「待核对」;已手动选过的(有 deptOrgId)不覆盖 */
  function matchByNames() {
    let exactN = 0;
    let fuzzyN = 0;
    let missN = 0;
    const next = record.collectives.map((c) => {
      if (!c.name.trim() || c.deptOrgId) return c;
      const m = findOrgByName(orgTree, c.name);
      if (!m) {
        missN += 1;
        return c;
      }
      if (m.exact) exactN += 1;
      else fuzzyN += 1;
      return { ...c, deptOrgId: m.orgId, dept: m.path, deptReview: !m.exact };
    });
    onRecordChange({ ...record, collectives: next });
    const parts: string[] = [];
    if (exactN) parts.push(`精确 ${exactN}`);
    if (fuzzyN) parts.push(`模糊 ${fuzzyN}(待核对)`);
    if (missN) parts.push(`未命中 ${missN}(请手动点选)`);
    toast.success(
      parts.length ? `按名称匹配:${parts.join(" · ")}` : "没有可匹配的集体",
    );
  }

  const bulkPreviewCount = splitNonEmptyLines(bulkText).length;
  const validCount = record.collectives.filter((c) => c.name.trim()).length;
  const reviewCount = record.collectives.filter((c) => c.deptReview).length;

  return (
    <div>
      {/* 批量粘贴区(置顶常显,与个人录入位置一致)*/}
      <div className="rounded-lg border border-[#E9E9E9] bg-white p-3 mb-4">
        <div className="text-[11px] text-[#6B7280] mb-2">
          批量粘贴受表彰单位 / 集体,<span className="font-mono mx-0.5">每行 1 个</span>
          (空行自动忽略)。点「追加」加到下方列表(不覆盖已有)。
        </div>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={5}
          placeholder={"机关党支部\n青年突击队\n第二联络部党支部\n后勤保障党小组"}
          className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-[#9CA3AF]">
            预解析到 {bulkPreviewCount} 行
          </span>
          <button
            type="button"
            onClick={applyBulk}
            disabled={bulkPreviewCount === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            <ClipboardListIcon className="w-3.5 h-3.5" />
            追加 {bulkPreviewCount} 项
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#F7F8FA]">
            <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
              <th className="px-2 py-2 text-left w-12">#</th>
              <th className="px-2 py-2 text-left">被表彰集体名称 *</th>
              <th className="px-2 py-2 text-left">单位 / 部门</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {record.collectives.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-2 py-6 text-center text-[#9CA3AF] text-xs"
                >
                  还没有录入 —— 上方批量粘贴,或点下方「+ 添加一行」
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
                      placeholder="如「青年突击队」/「先进基层党组织」"
                      className="flex-1 px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                    />
                  </div>
                </td>
                <td className="px-2 py-1">
                  <OrgPicker
                    tree={orgTree}
                    value={c.deptOrgId ?? ""}
                    onChange={(orgId) =>
                      patchCollective(c.rid, {
                        deptOrgId: orgId || undefined,
                        dept: orgId ? buildOrgPath(orgTree, orgId) : "",
                        deptReview: false,
                      })
                    }
                    title="选择所在单位/部门"
                    kind="admin"
                    placeholder="(从组织选)"
                    width="w-full"
                  />
                  {c.deptReview && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircleIcon className="w-2.5 h-2.5" />
                      名称不完全匹配·待核对
                    </span>
                  )}
                  {c.dept && !c.deptOrgId && (
                    <div
                      className="mt-0.5 text-[10px] text-[#9CA3AF] truncate"
                      title={c.dept}
                    >
                      {c.dept}
                    </div>
                  )}
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
            <button
              type="button"
              onClick={matchByNames}
              title="按集体名在组织树里匹配所在单位(不精确的会标「待核对」)"
              className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[var(--party-primary)]"
            >
              <ScanLineIcon className="w-3 h-3" />
              按名称匹配单位
            </button>
          </div>
          <span className="text-[10px] text-[#9CA3AF]">
            有效:{validCount} / {record.collectives.length}
            {reviewCount > 0 && (
              <span className="ml-1 text-amber-600">· {reviewCount} 待核对</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── 个人编辑器 ─── */

function IndividualEditor({
  record,
  onRecordChange,
  orgTree,
}: {
  record: HonorRecord;
  onRecordChange: (record: HonorRecord) => void;
  orgTree: OrgTreeNode[];
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
      // 有工号 → 按工号精确查;没工号 → 收集姓名按姓名兜底查
      const empNos = Array.from(
        new Set(parsed.map((p) => p.empNo).filter(Boolean)),
      );
      const nameOnly = Array.from(
        new Set(
          parsed
            .filter((p) => !p.empNo && p.name.trim())
            .map((p) => p.name.trim()),
        ),
      );
      let byEmpNo: Awaited<ReturnType<typeof usersApi.lookupByEmpNo>> = {};
      let byName: Awaited<ReturnType<typeof usersApi.lookupByName>> = {};
      try {
        if (empNos.length > 0) byEmpNo = await usersApi.lookupByEmpNo(empNos);
        if (nameOnly.length > 0) byName = await usersApi.lookupByName(nameOnly);
      } catch {
        toast.warning("批量查询失败,未命中的行按手填保留 — 仍可发证");
      }

      const newPersons: PersonRow[] = parsed.map((p) => {
        // 1) 有工号 → 按工号精确匹配(主路径)
        if (p.empNo) {
          const hit = byEmpNo[p.empNo];
          const adminId = hit?.adminOrgId ?? null;
          const adminPath = adminId ? buildOrgPath(orgTree, adminId) : "";
          return newPersonRow({
            name: hit?.name ?? p.name,
            empNo: p.empNo,
            dept: adminPath || hit?.adminOrgName || hit?.partyOrgName || "",
            deptOrgId: adminPath ? adminId ?? undefined : undefined,
            userId: hit?.id,
            found: Boolean(hit),
          });
        }
        // 2) 没工号 → 按姓名兜底补工号+单位
        const matches = byName[p.name.trim()] ?? [];
        if (matches.length === 1) {
          // 唯一命中 → 补工号 + 单位,标「按姓名·待核对」(重点检查)
          const hit = matches[0];
          const adminId = hit.adminOrgId ?? null;
          const adminPath = adminId ? buildOrgPath(orgTree, adminId) : "";
          return newPersonRow({
            name: hit.name,
            empNo: hit.username,
            dept: adminPath || hit.adminOrgName || hit.partyOrgName || "",
            deptOrgId: adminPath ? adminId ?? undefined : undefined,
            userId: hit.id,
            found: true,
            byName: true,
          });
        }
        if (matches.length > 1) {
          // 重名多人 → 不自动补工号(避免认错人),标「重名·待核对」
          return newPersonRow({
            name: p.name,
            empNo: "",
            found: false,
            byName: true,
            ambiguous: true,
          });
        }
        // 3) 没命中 → 手填
        return newPersonRow({ name: p.name, empNo: "", found: false });
      });

      onRecordChange({
        ...record,
        persons: [...record.persons, ...newPersons],
      });
      setPasteText("");

      const empnoHits = newPersons.filter((p) => p.found && !p.byName).length;
      const nameHits = newPersons.filter((p) => p.found && p.byName).length;
      const dupes = newPersons.filter((p) => p.ambiguous).length;
      const misses = newPersons.filter((p) => !p.found && !p.ambiguous).length;
      const parts = [`识别 ${newPersons.length} 人`];
      if (empnoHits) parts.push(`工号命中 ${empnoHits}`);
      if (nameHits) parts.push(`姓名补足 ${nameHits}(待核对)`);
      if (dupes) parts.push(`重名 ${dupes}(待核对)`);
      if (misses) parts.push(`未命中 ${misses}`);
      toast.success(parts.join(" · "));
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
            粘贴名单,每行 1 人 —
            <span className="font-mono mx-1">姓名</span>和
            <span className="font-mono mx-1">员工编号</span>
            可用 空格 / 逗号 / 顿号 / - / . 等分隔,也可直接连写(如「张三10001」);
            全角半角都行,顺序无所谓,3 位以上数字识别为员工号。
          </div>
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
          placeholder={"张三 10001\n李四、20003\n王五10005\n10002 赵六(分隔/顺序随意,备注忽略)"}
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
              <th className="px-2 py-2 text-left">单位/部门</th>
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
                      // 手动改 empNo → 该行视为未匹配,清掉 found/userId/待核对标记 防止误绑
                      patchPerson(p.rid, {
                        empNo: e.target.value,
                        found: false,
                        userId: undefined,
                        byName: false,
                        ambiguous: false,
                      })
                    }
                    placeholder="可选"
                    className="w-full px-1.5 py-1 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <OrgPicker
                    tree={orgTree}
                    value={p.deptOrgId ?? ""}
                    onChange={(orgId) =>
                      patchPerson(p.rid, {
                        deptOrgId: orgId || undefined,
                        dept: orgId ? buildOrgPath(orgTree, orgId) : "",
                      })
                    }
                    title="选择所在单位/部门"
                    kind="admin"
                    placeholder="(从组织选)"
                    width="w-full"
                  />
                  {p.dept && !p.deptOrgId && (
                    <div
                      className="mt-0.5 text-[10px] text-[#9CA3AF] truncate"
                      title={p.dept}
                    >
                      {p.dept}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1">
                  <MatchBadge
                    found={p.found}
                    hasEmpNo={Boolean(p.empNo)}
                    byName={p.byName}
                    ambiguous={p.ambiguous}
                  />
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
function MatchBadge({
  found,
  hasEmpNo,
  byName,
  ambiguous,
}: {
  found: boolean;
  hasEmpNo: boolean;
  byName?: boolean;
  ambiguous?: boolean;
}) {
  // 重名命中多人:没自动补工号,重点核对
  if (ambiguous) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
        <AlertCircleIcon className="w-3 h-3" />
        重名·待核对
      </span>
    );
  }
  // 按姓名兜底补的工号/单位:重点核对(可能认错人)
  if (found && byName) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
        <AlertCircleIcon className="w-3 h-3" />
        按姓名·待核对
      </span>
    );
  }
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
