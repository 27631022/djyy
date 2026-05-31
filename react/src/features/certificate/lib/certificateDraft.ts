/**
 * 证书发证 V3 — 草稿持久化 + 防抖 hook。
 *
 * 设计要点:
 *  - localStorage(不是 sessionStorage):用户「退出页面再返回」也能恢复
 *  - key 含 userId:多账号在同一台机器上互不串
 *  - schema version 标:以后改 draft shape,直接抛旧 draft 不崩
 *  - 字段级 + 200ms 防抖写:打字流畅不卡,但不会丢失中间状态
 *  - 全部 try/catch:配额溢出 / 隐私模式 静默失败,不阻塞发证流程
 *
 * 数据形态(下方 types)同时也是 Phase 4-7 子组件的契约:
 *  - HonorRecord = Step 2 一行表彰记录
 *  - PersonRow   = Step 3b 一个被表彰人(individual 类型 honor 用)
 *  - UnitRow     = Step 3a 一个被表彰单位/集体(unit/collective 类型 honor 用)
 */

import { useEffect, useRef } from "react";
import type { ExtractHonorResponse } from "../api";

/* ─── 数据类型 ─── */

/** 荣誉类型(V3):仅 2 类 — 个人 / 集体(团队/单位/党组织 等都归集体)。 */
export type HonorType = "individual" | "collective";

/**
 * wizard 主步骤数:
 *  1 上传/AI · 2 表彰公共信息 · 3 选证书模板 · 4 录入对象(per-record 子步骤) · 5 清单+发证
 */
export type WizardStep = 1 | 2 | 3 | 4 | 5;

/**
 * 个人荣誉的被表彰人(Step 3b 填)。
 * 状态:
 *  - found=true 表示库中有(userId/dept 由 lookup-by-empno 自动回填)
 *  - found=false 表示「库中暂无此人」,允许用户保留(发证时按粘贴的 name+empNo 走)
 */
export interface PersonRow {
  /** 前端 key,稳定不变 */
  rid: string;
  name: string;
  empNo: string;
  /** 部门:lookup 命中时取主行政机构,未命中可手填 */
  dept: string;
  /** lookup 命中后的 User.id,发证时作为 recipientUserId(命中才传) */
  userId?: string;
  /** 库中是否找到 — 控制 UI 状态徽章 */
  found: boolean;
}

/**
 * 集体荣誉的被表彰对象(Step 3a 填)。
 * 自由文本,不关联 Organization 表(产品决策)。
 * 适用范围:团队 / 单位 / 党组织 / 家庭 等所有非个人载体。
 */
export interface CollectiveRow {
  rid: string;
  /** 集体名,如「青年突击队」/「机关党支部」/「先进基层党组织(机关综合处)」 */
  name: string;
}

/**
 * Step 2 一条表彰记录 — 一份表彰文件可能包含多条(如「两优一先」3 条)。
 *
 * 年份(yearLabel)和表彰日期(issueDate)在 draft 顶层共享,
 * 不再 per-record 存储(同一份表彰文件下所有荣誉共用同一个时间元数据)。
 *
 * persons / collectives 互斥:
 *  - honorType=individual → persons 有效,collectives 一直空
 *  - honorType=collective → collectives 有效,persons 一直空
 *  切换 honorType 时调用方应清空另一边(避免老数据残留)。
 */
export interface HonorRecord {
  rid: string;
  /** 必选,选定后 honorName 从 template 名冗余进来便于展示 */
  templateId: string | null;
  /** 从所选 template.name 冗余下来 — 渲染列表 / 预览用 */
  honorName: string;
  honorType: HonorType;
  persons: PersonRow[];
  collectives: CollectiveRow[];
}

/**
 * 草稿根对象。
 * version 用于将来 schema 演进时反向兼容:遇到不同 version 直接 ignore 旧 draft。
 */
export interface CertificateDraftV1 {
  version: 1;
  step: WizardStep;
  /** Step 1 AI 抽取结果(可空,代表「未抽取或已手动跳过 AI」) */
  extracted: ExtractHonorResponse | null;
  /** 表彰年度 — 同一份表彰文件下所有荣誉共用,「2024」或「2024-2025」 */
  yearLabel: string;
  /** 表彰日期 — 同一份表彰文件下所有荣誉共用,ISO「YYYY-MM-DD」 */
  issueDate: string;
  /** 有效期 — 同一份表彰文件下所有荣誉共用,ISO「YYYY-MM-DD」;空 = 永久有效 */
  validUntil: string;
  /** Step 2 之后的核心数据 */
  records: HonorRecord[];
  /** 最近一次保存时间,UI 可显示「已保存于 xx 秒前」 */
  updatedAt: string;
}

/* ─── localStorage 读写 ─── */

const KEY_PREFIX = "djyy_cert_draft_v1_";

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * 拉取当前用户的草稿。
 * 返回 null:无 draft / 解析失败 / version 不匹配。
 *
 * 兼容老 draft:早期 yearLabel/issueDate 在 records[] 里 per-record,
 * 现在迁到顶层共享。loadDraft 自动从第一条 record 取迁移值。
 */
export function loadDraft(userId: string): CertificateDraftV1 | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    type LegacyRecord = HonorRecord & {
      yearLabel?: string;
      issueDate?: string;
    };
    const parsed = JSON.parse(raw) as Partial<CertificateDraftV1> & {
      records?: LegacyRecord[];
    };
    if (parsed?.version !== 1) return null;
    if (typeof parsed.step !== "number") return null;
    if (!Array.isArray(parsed.records)) return null;
    return {
      version: 1,
      step: parsed.step,
      extracted: parsed.extracted ?? null,
      yearLabel:
        parsed.yearLabel ??
        parsed.records[0]?.yearLabel ??
        String(new Date().getFullYear()),
      issueDate:
        parsed.issueDate ?? parsed.records[0]?.issueDate ?? todayIso(),
      validUntil: parsed.validUntil ?? "",
      records: parsed.records,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * 写入草稿(自动盖 updatedAt 戳)。
 * 配额溢出 / 隐私模式 → 静默失败。
 */
export function saveDraft(userId: string, d: CertificateDraftV1): void {
  if (!userId) return;
  try {
    const toWrite: CertificateDraftV1 = {
      ...d,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key(userId), JSON.stringify(toWrite));
  } catch {
    /* ignore */
  }
}

/** 全部发证成功 / 用户主动放弃 时调用 */
export function clearDraft(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

/* ─── 工厂方法 ─── */

/** 8 字符稳定前端 rid。React key 用,不进网络协议 */
export function makeRid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyDraft(): CertificateDraftV1 {
  return {
    version: 1,
    step: 1,
    extracted: null,
    yearLabel: String(new Date().getFullYear()),
    issueDate: todayIso(),
    validUntil: "",
    records: [],
    updatedAt: new Date().toISOString(),
  };
}

export function newPersonRow(partial?: Partial<PersonRow>): PersonRow {
  return {
    rid: makeRid(),
    name: partial?.name ?? "",
    empNo: partial?.empNo ?? "",
    dept: partial?.dept ?? "",
    userId: partial?.userId,
    found: partial?.found ?? false,
  };
}

export function newCollectiveRow(partial?: Partial<CollectiveRow>): CollectiveRow {
  return {
    rid: makeRid(),
    name: partial?.name ?? "",
  };
}

export function newHonorRecord(partial?: Partial<HonorRecord>): HonorRecord {
  return {
    rid: makeRid(),
    templateId: partial?.templateId ?? null,
    honorName: partial?.honorName ?? "",
    honorType: partial?.honorType ?? "individual",
    persons: partial?.persons ?? [],
    collectives: partial?.collectives ?? [],
  };
}

/**
 * 把 record 折成统一形态的扁平收件人列表 — 集体走 CollectiveRow,个人走 PersonRow,
 * 都过滤掉 name 为空的脏数据。
 *
 * Step 4(预览 / 发证)和容器的 handleIssueAll 都用这个,
 * 不要散在两边各写一份避免漂移。
 */
export interface FlatRecipient {
  rid: string;
  name: string;
  empNo: string;
  dept: string;
  userId?: string;
}

export function flattenRecipients(record: HonorRecord): FlatRecipient[] {
  if (record.honorType === "collective") {
    return record.collectives
      .filter((c) => c.name.trim())
      .map((c) => ({
        rid: c.rid,
        name: c.name.trim(),
        empNo: "",
        dept: "",
      }));
  }
  return record.persons
    .filter((p) => p.name.trim())
    .map((p) => ({
      rid: p.rid,
      name: p.name.trim(),
      empNo: p.empNo.trim(),
      dept: p.dept.trim(),
      userId: p.userId,
    }));
}

/* ─── 防抖 hook ─── */

/**
 * 把 draft 以 200ms 防抖写 localStorage。
 *
 * 用法:在 CertificateIssue 容器顶部
 *   const [draft, setDraft] = useState<CertificateDraftV1>(() => loadDraft(userId) ?? emptyDraft());
 *   useDebouncedDraft(userId, draft);
 *
 * 任何 draft 引用变化都 schedule 一次 200ms 后的 save;
 * 在防抖窗口内继续改 → 重置定时器;unmount 清除。
 *
 * 注:首次挂载会触发一次 save(写回刚加载的同样内容),代价极低,不专门去重。
 */
export function useDebouncedDraft(
  userId: string | null | undefined,
  draft: CertificateDraftV1,
  delay = 200,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(userId, draft);
      timerRef.current = null;
    }, delay);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [userId, draft, delay]);
}
