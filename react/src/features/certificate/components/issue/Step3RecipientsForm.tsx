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
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  newCollectiveRow,
  newPersonRow,
  type CollectiveRow,
  type HonorRecord,
  type PersonCandidate,
  type PersonRow,
} from "../../lib/certificateDraft";
import { parsePersonLines } from "../../lib/parsePersonLines";
import { buildOrgPath, findOrgByName } from "../../lib/orgPath";
import type { CertificateTemplateDto } from "../../api";
import { CandidatePicker } from "./CandidatePicker";
import {
  usersApi,
  OrgPicker,
  type MatchByNameOrgResult,
  type UserByEmpNoLite,
} from "@/features/user";
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

/** UserByEmpNoLite → 候选(把 orgId 解析成全称路径,路径是分辨同名者的关键信息) */
function toCandidate(u: UserByEmpNoLite, orgTree: OrgTreeNode[]): PersonCandidate {
  const path = u.adminOrgId ? buildOrgPath(orgTree, u.adminOrgId) : "";
  return {
    userId: u.id,
    name: u.name,
    empNo: u.username,
    deptPath: path || u.adminOrgName || "",
    deptOrgId: u.adminOrgId ?? undefined,
    partyOrgName: u.partyOrgName,
  };
}

/**
 * 一条匹配结果 → PersonRow 的字段补丁。recognize()(粘贴)与 matchAll()(AI 抽取后)共用,
 * 保证两条路径的回写规则**永远一致**。
 *
 * 铁律:
 *  - unique 也标 byName「待核对」 —— 姓名+单位不是权威身份,只是强线索
 *  - ambiguous **绝不写 userId/empNo/dept**,只挂候选等用户点选
 *  - **除 unique 外一律不碰 dept/deptOrgId**:该行可能是用户手动用组织树点选过的
 *    (matchAll 的目标 = 没绑 userId 的行,恰好包含这种行),匹配没命中不该把人家
 *    手选的单位擦掉;文件里写的单位仍以 orgHint 形式显示在该列,不进证书快照(I3)。
 *  - 候选为空的 org-unresolved 等同 none:否则会标出「待点选」却没有候选可点 → 死锁。
 */
function patchFromMatch(
  m: MatchByNameOrgResult,
  orgTree: OrgTreeNode[],
): Partial<PersonRow> {
  if (m.status === "unique") {
    const c = toCandidate(m.candidates[0], orgTree);
    return {
      name: c.name,
      empNo: c.empNo,
      // 唯一命中 = 权威归属,可以覆盖 dept(这是 dept 允许被写入的三条路径之一)
      dept: c.deptPath,
      deptOrgId: c.deptOrgId,
      userId: c.userId,
      found: true,
      byName: true,
      ambiguous: false,
      candidates: undefined,
      candidatesTruncated: false,
    };
  }
  if (
    (m.status === "ambiguous" || m.status === "org-unresolved") &&
    m.candidates.length > 0
  ) {
    return {
      empNo: "",
      userId: undefined,
      found: false,
      byName: true,
      ambiguous: true,
      candidates: m.candidates.map((c) => toCandidate(c, orgTree)),
      candidatesTruncated: m.truncated,
    };
  }
  // none(以及候选为空的 org-unresolved)—— 库里没这个人:只清身份字段,不动单位
  return {
    empNo: "",
    userId: undefined,
    found: false,
    byName: false,
    ambiguous: false,
    candidates: undefined,
    candidatesTruncated: false,
  };
}

/** 匹配结果统计 → toast 文案(两条路径共用) */
function matchToastParts(results: MatchByNameOrgResult[]): string[] {
  const uniq = results.filter((r) => r.status === "unique").length;
  const pick = results.filter(
    (r) => r.status === "ambiguous" || r.status === "org-unresolved",
  ).length;
  const miss = results.filter((r) => r.status === "none").length;
  const parts: string[] = [];
  if (uniq) parts.push(`唯一命中 ${uniq}(待核对)`);
  if (pick) parts.push(`需点选 ${pick}`);
  if (miss) parts.push(`库中暂无 ${miss}`);
  return parts;
}

/**
 * 「这一行的身份作废」补丁 —— 手改姓名/工号时用。
 *
 * 必须把**身份**(userId/empNo 标记)与**由身份带出来的快照**(dept/deptOrgId)
 * 和**上一个人的候选**(candidates)一起清掉:三者是一个整体,只清一部分就会出现
 * 「B 的工号 + A 的单位」或「改成 B 却还挂着 A 的候选」这种脱钩状态,而且清掉 userId
 * 之后后端的身份一致性闸不再触发(它只在传了 recipientUserId 时校验),前后端都拦不住。
 *
 * 不清 name/orgHint:前者是调用方正在改的值,后者是文件原文线索(不是快照)。
 */
const clearBinding: Partial<PersonRow> = {
  dept: "",
  deptOrgId: undefined,
  userId: undefined,
  found: false,
  byName: false,
  ambiguous: false,
  candidates: undefined,
  candidatesTruncated: false,
};

/** DTO ArrayMaxSize(200) —— 单个荣誉可能上百人(两优一先「优秀共产党员」130 人),须分批 */
const MATCH_BATCH = 200;

async function matchInBatches(
  items: { name: string; orgName?: string }[],
): Promise<MatchByNameOrgResult[]> {
  const out: MatchByNameOrgResult[] = [];
  for (let i = 0; i < items.length; i += MATCH_BATCH) {
    out.push(...(await usersApi.matchByNameOrg(items.slice(i, i + MATCH_BATCH))));
  }
  return out;
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
  const [matching, setMatching] = useState(false);

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

  /**
   * 按集体名匹配所在单位。三级阶梯,已手动选过的(有 deptOrgId)一律不覆盖:
   *
   *  1. **党组织解析**(主路径 —— 先进基层党委/党支部 都是党组织名):
   *     后端 PartyAdminLink → 去后缀名匹配 → 上溯党委。
   *     只有 via='link' 才算可信;name/ancestor 一律标「待核对」;多个同名党组织 → 不猜。
   *  2. **文件里的上级单位前缀**(orgHint,如「甘肃分公司:酒泉配送中心党支部」的左半):
   *     党组织树里查无此名时兜底(实测「LNG配送中心党支部」就不在党组织树里)。
   *  3. **按集体名在行政树里找**(老逻辑,非党组织类集体如「青年突击队」用)。
   *
   * 只有 exact 命中才写 deptOrgId(会进证书的正式归属);模糊命中只填文本 + 待核对。
   */
  async function matchByNames() {
    const targets = record.collectives.filter((c) => c.name.trim() && !c.deptOrgId);
    if (targets.length === 0) {
      toast.info("没有需要匹配的集体(已选过单位的行会跳过)");
      return;
    }
    setMatching(true);
    try {
      let resolved: Awaited<ReturnType<typeof organizationsApi.resolvePartyOrgs>> = {};
      try {
        resolved = await organizationsApi.resolvePartyOrgs(
          Array.from(new Set(targets.map((c) => c.name.trim()))),
        );
      } catch {
        toast.warning("党组织解析失败,已退回按名称在行政树里匹配");
      }

      let linkN = 0;
      let reviewN = 0;
      let pickN = 0;
      let missN = 0;
      const next = record.collectives.map((c) => {
        if (!c.name.trim() || c.deptOrgId) return c;

        // 1) 党组织解析
        const hits = resolved[c.name.trim()] ?? [];
        const usable = hits.filter((h) => h.adminOrgId);
        if (usable.length > 1) {
          // 同名党组织多个(如「特车运输大队党支部」在塔运司与新疆油田运输分公司各一)
          // → 不猜。**绝不把「路径A 或 路径B」写进 dept** —— dept 会原样烤进证书 PDF
          //   与 DB 的 recipientDept,写进去就是在证书上印一句废话。
          //   候选只作为 UI 提示(deptNote),让用户用组织树点选真正的单位。
          pickN += 1;
          return {
            ...c,
            dept: "",
            deptOrgId: undefined,
            deptReview: true,
            deptVia: usable[0].via,
            deptNote: `同名党组织有 ${usable.length} 个:${usable
              .map((h) => h.adminOrgName)
              .join(" / ")} —— 请手动点选`,
          };
        }
        if (usable.length === 1) {
          const h = usable[0];
          const trusted = h.via === "link";
          if (trusted) linkN += 1;
          else reviewN += 1;
          return {
            ...c,
            dept: h.adminOrgPath ?? "",
            // 只有显式关联才配写 deptOrgId(会作为正式归属);推导出来的一律待核对
            deptOrgId: trusted ? (h.adminOrgId ?? undefined) : undefined,
            deptReview: !trusted,
            deptVia: h.via,
            deptNote: undefined,
          };
        }

        // 2) 文件里的上级单位前缀兜底
        if (c.orgHint) {
          const m = findOrgByName(orgTree, c.orgHint);
          if (m) {
            if (m.exact) linkN += 1;
            else reviewN += 1;
            return {
              ...c,
              deptOrgId: m.exact ? m.orgId : undefined,
              dept: m.path,
              deptReview: !m.exact,
              deptVia: "none" as const,
              deptNote: undefined,
            };
          }
        }

        // 3) 按集体名在行政树里找(非党组织类集体)
        const m = findOrgByName(orgTree, c.name);
        if (!m) {
          missN += 1;
          return c;
        }
        if (m.exact) linkN += 1;
        else reviewN += 1;
        return {
          ...c,
          deptOrgId: m.exact ? m.orgId : undefined,
          dept: m.path,
          deptReview: !m.exact,
          deptVia: "none" as const,
          deptNote: undefined,
        };
      });
      onRecordChange({ ...record, collectives: next });

      const parts: string[] = [];
      if (linkN) parts.push(`确定 ${linkN}`);
      if (reviewN) parts.push(`推导 ${reviewN}(待核对)`);
      if (pickN) parts.push(`同名多个 ${pickN}(请手动点选)`);
      if (missN) parts.push(`未命中 ${missN}(请手动点选)`);
      toast.success(
        parts.length ? `按党组织匹配单位:${parts.join(" · ")}` : "没有可匹配的集体",
      );
    } finally {
      setMatching(false);
    }
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
                      // 用户手动点选 = 权威确认 → 清掉推导态的待核对与候选提示
                      patchCollective(c.rid, {
                        deptOrgId: orgId || undefined,
                        dept: orgId ? buildOrgPath(orgTree, orgId) : "",
                        deptReview: false,
                        deptVia: undefined,
                        deptNote: undefined,
                      })
                    }
                    title="选择所在单位/部门"
                    kind="admin"
                    placeholder="(从组织选)"
                    width="w-full"
                  />
                  {c.deptReview && (
                    <span
                      className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                      title={collectiveReviewHint(c)}
                    >
                      <AlertCircleIcon className="w-2.5 h-2.5" />
                      {collectiveReviewLabel(c)}
                    </span>
                  )}
                  {/* 同名党组织多个时的候选提示 —— 仅 UI,不进证书 */}
                  {c.deptNote && (
                    <div className="mt-0.5 text-[10px] text-amber-700">
                      {c.deptNote}
                    </div>
                  )}
                  {c.dept && !c.deptOrgId && (
                    <div
                      className="mt-0.5 text-[10px] text-[#9CA3AF] truncate"
                      title={c.dept}
                    >
                      {c.dept}
                    </div>
                  )}
                  {!c.dept && !c.deptOrgId && c.orgHint && (
                    <div
                      className="mt-0.5 text-[10px] text-blue-600 truncate"
                      title={`表彰文件里写的上级单位:${c.orgHint}(待匹配确认)`}
                    >
                      文件:{c.orgHint}
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
              disabled={matching}
              title="先按党组织关联找对口单位(党委/党支部),再按文件里的上级单位、集体名兜底。推导出来的会标「待核对」"
              className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[var(--party-primary)] disabled:opacity-50"
            >
              {matching ? (
                <Loader2Icon className="w-3 h-3 animate-spin" />
              ) : (
                <ScanLineIcon className="w-3 h-3" />
              )}
              按党组织匹配单位
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

/**
 * 集体行「待核对」的徽章文案 —— 按单位是怎么推出来的分档。
 *
 * 为什么绝大多数党支部都会是「待核对」:真实库里党支部配了显式关联的只有 4/361(1%),
 * 支部的单位只能从上级党委推出来 —— 这是正确的,不是匹配没做好。要提高可信度,
 * 正解是去「组织管理 → 关联机构」补党组织↔行政机构关联,而不是放松匹配。
 */
function collectiveReviewLabel(c: CollectiveRow): string {
  if (c.deptVia === "ancestor") return "由上级党委推得·待核对";
  if (c.deptVia === "name") return "按名称推得·待核对";
  return "名称不完全匹配·待核对";
}

function collectiveReviewHint(c: CollectiveRow): string {
  if (c.deptVia === "ancestor") {
    return "该党支部没有配「对口行政机构」关联,单位是从它的上级党委推出来的,请核对是否正确(可到「组织管理 → 关联机构」补关联)";
  }
  if (c.deptVia === "name") {
    return "该党组织没有配「对口行政机构」关联,单位是按名称去掉党组织后缀推出来的,请核对";
  }
  return "名称不完全匹配,单位是模糊匹配出来的,请核对";
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
      // 有工号 → 按工号精确查(主路径,最权威);没工号 → 走「姓名+单位」匹配
      const empNos = Array.from(
        new Set(parsed.map((p) => p.empNo).filter(Boolean)),
      );
      const nameRows = parsed.filter((p) => !p.empNo && p.name.trim());

      let byEmpNo: Awaited<ReturnType<typeof usersApi.lookupByEmpNo>> = {};
      let matches: MatchByNameOrgResult[] = [];
      try {
        if (empNos.length > 0) byEmpNo = await usersApi.lookupByEmpNo(empNos);
        if (nameRows.length > 0) {
          matches = await matchInBatches(
            nameRows.map((p) => ({
              name: p.name.trim(),
              orgName: p.orgName || undefined,
            })),
          );
        }
      } catch {
        toast.warning("批量查询失败,未命中的行按手填保留 — 仍可发证");
      }

      // 按下标对齐:matches 与 nameRows 一一对应
      const matchByRid = new Map<(typeof nameRows)[number], MatchByNameOrgResult>();
      nameRows.forEach((p, i) => {
        const m = matches[i];
        if (m) matchByRid.set(p, m);
      });

      const newPersons: PersonRow[] = parsed.map((p) => {
        // 1) 有工号 → 按工号精确匹配(主路径)
        if (p.empNo) {
          const hit = byEmpNo[p.empNo];
          const adminId = hit?.adminOrgId ?? null;
          const adminPath = adminId ? buildOrgPath(orgTree, adminId) : "";
          return newPersonRow({
            name: hit?.name ?? p.name,
            empNo: p.empNo,
            // 工号命中 = 权威归属,**绝不**用 orgHint 覆盖(前缀可能是历史/口语称谓)
            dept: adminPath || hit?.adminOrgName || hit?.partyOrgName || "",
            deptOrgId: adminPath ? adminId ?? undefined : undefined,
            orgHint: p.orgName ?? "",
            userId: hit?.id,
            found: Boolean(hit),
          });
        }
        // 2) 没工号 → 「姓名 + 单位」匹配(唯一/多候选/未命中 由 patchFromMatch 统一裁决)
        const m = matchByRid.get(p);
        const base = newPersonRow({ name: p.name, orgHint: p.orgName ?? "" });
        return m ? { ...base, ...patchFromMatch(m, orgTree) } : base;
      });

      onRecordChange({
        ...record,
        persons: [...record.persons, ...newPersons],
      });
      setPasteText("");

      const empnoHits = newPersons.filter((p) => p.found && !p.byName).length;
      const parts = [`识别 ${newPersons.length} 人`];
      if (empnoHits) parts.push(`工号命中 ${empnoHits}`);
      parts.push(...matchToastParts(matches));
      toast.success(parts.join(" · "));

      // 交叉校验:粘了 N 行却没解析出人 → 静默丢人是这个解析器的老毛病,必须告警
      const lineCount = splitNonEmptyLines(pasteText).length;
      if (newPersons.length < lineCount) {
        toast.warning(
          `粘贴了 ${lineCount} 行,只识别出 ${newPersons.length} 人 —— 请核对是否有行未被识别`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * 「按姓名+单位匹配员工编号」—— 对表格里还没绑定 userId 的行批量匹配。
   * 主要服务 AI 抽取路径:Step2 把文件里的单位前缀放进了 orgHint,这里用它收敛候选。
   */
  async function matchAll() {
    const targets = record.persons.filter((p) => !p.userId && p.name.trim());
    if (targets.length === 0) {
      toast.info("没有需要匹配的行(已绑定员工编号的行会跳过)");
      return;
    }
    setBusy(true);
    try {
      const results = await matchInBatches(
        targets.map((p) => ({ name: p.name.trim(), orgName: p.orgHint || undefined })),
      );
      const patchByRid = new Map<string, Partial<PersonRow>>();
      targets.forEach((p, i) => {
        const m = results[i];
        if (m) patchByRid.set(p.rid, patchFromMatch(m, orgTree));
      });
      onRecordChange({
        ...record,
        persons: record.persons.map((p) => {
          const patch = patchByRid.get(p.rid);
          return patch ? { ...p, ...patch } : p;
        }),
      });

      const parts = [`匹配 ${results.length} 人`, ...matchToastParts(results)];
      toast.success(parts.join(" · "));
      const needPick = results.filter(
        (r) => r.status === "ambiguous" || r.status === "org-unresolved",
      ).length;
      if (needPick > 0) {
        toast.warning(
          `${needPick} 人同名需人工点选 —— 未点选前不会绑定员工编号,请逐个确认`,
          { duration: 6000 },
        );
      }
    } catch {
      toast.error("匹配失败,请重试(未匹配的行仍可手填工号)");
    } finally {
      setBusy(false);
    }
  }

  // 只数行(非空)即可,无需触发完整的 name/empNo 解析
  const pastePreviewCount = splitNonEmptyLines(pasteText).length;
  const validCount = record.persons.filter((p) => p.name.trim()).length;
  // 渲染期派生(零 effect):还没绑定 userId 的行 / 其中带单位前缀的行 / 待点选的行
  const pendingMatchCount = record.persons.filter(
    (p) => !p.userId && p.name.trim(),
  ).length;
  const hintedCount = record.persons.filter(
    (p) => !p.userId && p.name.trim() && p.orgHint,
  ).length;
  const needPickCount = record.persons.filter((p) => p.ambiguous).length;

  return (
    <div>
      {/* 粘贴区 */}
      <div className="rounded-lg border border-[#E9E9E9] bg-white p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-[#6B7280]">
            粘贴名单 —
            <span className="font-mono mx-1">姓名</span>和
            <span className="font-mono mx-1">员工编号</span>
            可用 空格 / 逗号 / 顿号 / - / . 等分隔,也可直接连写(如「张三10001」);
            全角半角都行,顺序无所谓,3 位以上数字识别为员工号。
            <br />
            也支持表彰文件的
            <span className="font-mono mx-1">单位:姓名1、姓名2</span>
            格式 —— 单位会用来在重名时确定是哪一位。
          </div>
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
          placeholder={
            "云贵分公司:聂  伟、朱智勇\n重庆分公司:吴媛媛、黑  瑞\n张三 10001\n李四、20003\n10002 赵六(分隔/顺序随意,备注忽略)"
          }
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

      {/* AI 抽取路径:文件里的单位前缀已放进各行 orgHint,这里一键批量匹配工号 */}
      {pendingMatchCount > 0 && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-2.5 flex items-center justify-between gap-3">
          <div className="text-[11px] text-blue-900 min-w-0">
            有 <span className="font-semibold">{pendingMatchCount}</span> 行还没绑定员工编号
            {hintedCount > 0 && (
              <span className="text-blue-700">
                (其中 {hintedCount} 行带文件里的单位:
                {[...new Set(record.persons.map((p) => p.orgHint).filter(Boolean))]
                  .slice(0, 3)
                  .join("、")}
                …)
              </span>
            )}
            。按「姓名 + 单位」批量匹配可自动补工号;同名多人的行会让你点选。
          </div>
          <button
            type="button"
            onClick={matchAll}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {busy ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SearchIcon className="w-3.5 h-3.5" />
            )}
            按姓名+单位匹配员工编号
          </button>
        </div>
      )}

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
                      // 改姓名 = 换了个人 → 整行身份作废(clearBinding)。
                      // 否则:陈旧 candidates 还挂着上一个人的候选,点开点选器会把姓名
                      // 静默改回上一个人并绑上他的 userId;陈旧 dept 会把上一个人的
                      // 单位烤进这个人的证书。
                      patchPerson(p.rid, {
                        name: e.target.value,
                        ...clearBinding,
                      })
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
                      // 手动改 empNo → 该行视为未匹配,整行身份作废防误绑。
                      // ⚠ dept/deptOrgId 也必须清:它们是上一次「候选点选/工号命中」写进去的
                      // 权威快照,出处(userId)一旦被抹掉,快照就与人脱钩 —— 留着会把
                      // 上一个人的单位烤进这个人的证书(且此时无 userId,后端身份闸不触发)。
                      patchPerson(p.rid, {
                        empNo: e.target.value,
                        ...clearBinding,
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
                  {/* 文件里写的单位(仅线索,未确认成正式归属前只作提示) */}
                  {!p.dept && !p.deptOrgId && p.orgHint && (
                    <div
                      className="mt-0.5 text-[10px] text-blue-600 truncate"
                      title={`表彰文件里写的单位:${p.orgHint}(待匹配确认)`}
                    >
                      文件:{p.orgHint}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1">
                  {p.ambiguous && p.candidates?.length ? (
                    // 同名多人 → 必须人工点选(系统不猜身份)
                    <CandidatePicker
                      row={p}
                      onPick={(c) =>
                        patchPerson(p.rid, {
                          name: c.name,
                          empNo: c.empNo,
                          dept: c.deptPath,
                          deptOrgId: c.deptOrgId,
                          userId: c.userId,
                          found: true,
                          byName: true,
                          ambiguous: false,
                          candidates: undefined,
                          candidatesTruncated: false,
                        })
                      }
                    />
                  ) : (
                    <MatchBadge
                      found={p.found}
                      hasEmpNo={Boolean(p.empNo)}
                      byName={p.byName}
                      ambiguous={p.ambiguous}
                    />
                  )}
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
            {needPickCount > 0 && (
              <span className="ml-1 text-red-600 font-medium">
                · {needPickCount} 人同名待点选
              </span>
            )}
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
