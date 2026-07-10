/**
 * 党员真实数据导入 — 一次性迁移脚本(独立 tsx 入口,不经 Nest DI / 通用 ImportService)。
 *
 * 把 `导入单位姓名/党员.xlsx`(5544 名党员)载入库,按「所在支部 = 党组织全称」精确匹配党组织树:
 *   1. 用户以「员工编号」为唯一键(建号 / 命中即复用),天然处理姓名重复(282 组重名 748 人,靠编号区分)。
 *   2. 每名党员按其「所在支部」(党组织全称)挂 1 条党组织归属(isPrimary=true;党组织每人至多 1 个)。
 *   3. 补全信息:
 *        · 身份证号 → 自定义字段 id_card_no
 *        · 性别     → 由身份证第 17 位推导(奇=男 偶=女)→ gender(male/female)
 *        · 出生日期 → 由身份证 7~14 位推导 → birth_date
 *        · 家庭住址 → address
 *        · 人员类别 → political_status(正式党员=中共党员 party_member / 预备党员=中共预备党员 probationary_member)
 *        · 入党日期 / 转正日期 → party_join_date / party_confirm_date(本脚本会先 upsert 这两个自定义字段定义)
 *        · 手机 / 邮箱 → User.phone / User.email(邮箱唯一;文件内重复邮箱只给首见者,其余置空并告警)
 *   4. 无任何角色的用户补默认「普通用户 member」(scope=self,最小权限),与后台「导入用户」一致。
 *
 * 已存在用户(seed 演示账号)只「补全」:更新姓名/手机/邮箱(占位 @dyy.local → 真邮箱)+ 合并自定义字段 + 加党组织归属,
 * 不动其已有角色/行政归属。
 *
 * 用法(cwd = backend):
 *   npx tsx prisma/import-party-members.ts                # dry-run,只打印计划不写库
 *   npx tsx prisma/import-party-members.ts --commit       # 真正写库
 *   npx tsx prisma/import-party-members.ts --commit "路径/党员.xlsx"   # 指定源文件
 *
 * 幂等:重跑只补差(建号 skipDuplicates、归属/角色 skipDuplicates、已存在用户按文件覆盖基本信息)。
 * ⚠ 依赖党组织已导入(先跑 db:import:party);member 角色需已 seed。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
const argPath = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.xlsx?$/i.test(a));
const DEFAULT_PATH = 'C:/Users/zhangming/Desktop/导入单位姓名/党员.xlsx';
const XLSX_PATH = argPath ? path.resolve(argPath) : DEFAULT_PATH;

// 人员类别 → 政治面貌字典 code(user_political_status)
const CATEGORY_TO_POLITICAL: Record<string, string> = {
  正式党员: 'party_member',
  预备党员: 'probationary_member',
};

// 本脚本要补全信息用到、但 seed 里原本没有的两个党员日期字段(先 upsert 定义再写值)
const EXTRA_FIELDS = [
  { code: 'party_join_date', label: '入党日期', type: 'date', sortOrder: 62 },
  { code: 'party_confirm_date', label: '转正日期', type: 'date', sortOrder: 64 },
];

interface Rec {
  rowNo: number;
  branch: string; // 所在支部 = 党组织全称
  name: string;
  empNo: string; // 员工编号 = username
  idCard: string;
  phone: string;
  email: string;
  address: string;
  category: string; // 正式党员 / 预备党员
  joinDate: string;
  confirmDate: string;
}

function s(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}
// 员工编号标准化:纯数字且 <8 位 → 前补 0 到 8 位(与 import-employees 一致,防重复账号)
function empNo(v: unknown): string {
  const t = s(v);
  return /^\d+$/.test(t) && t.length < 8 ? t.padStart(8, '0') : t;
}

/** 18 位身份证第 17 位:奇=男 偶=女;非法格式返回 null */
function genderFromId(id: string): 'male' | 'female' | null {
  if (!/^\d{17}[\dXx]$/.test(id)) return null;
  return parseInt(id[16], 10) % 2 === 1 ? 'male' : 'female';
}

/** 身份证 7~14 位 → YYYY-MM-DD;非法日期返回 '' */
function birthFromId(id: string): string {
  if (!/^\d{17}[\dXx]$/.test(id)) return '';
  const y = +id.slice(6, 10),
    m = +id.slice(10, 12),
    d = +id.slice(12, 14);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
}

/** 只保留 YYYY-MM-DD 形态的日期(文件已是此格式);否则空 */
function normDate(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function readRecords(): Rec[] {
  if (!fs.existsSync(XLSX_PATH)) throw new Error(`源文件不存在:${XLSX_PATH}`);
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true });
  // 表头可能不在第 1 行(首行是合并标题)—— 动态定位含「所在支部」+「员工编号」的表头行
  const hIdx = aoa.findIndex(
    (r) => r.map(s).includes('所在支部') && r.map(s).includes('员工编号'),
  );
  if (hIdx < 0) throw new Error('未找到表头行(需含「所在支部」和「员工编号」列)');
  const header = aoa[hIdx].map(s);
  const col: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) col[h] = i;
  });
  const need = ['所在支部', '姓名', '员工编号', '身份证号'];
  for (const n of need) if (!(n in col)) throw new Error(`表头缺少必需列「${n}」`);
  const get = (r: unknown[], n: string): string => (n in col ? s(r[col[n]]) : '');
  return aoa
    .slice(hIdx + 1)
    .filter((r) => r.some((c) => s(c) !== ''))
    .map((r, i) => ({
      rowNo: hIdx + 2 + i,
      branch: get(r, '所在支部'),
      name: get(r, '姓名'),
      empNo: empNo(get(r, '员工编号')), // 标准化补零到 8 位
      idCard: get(r, '身份证号'),
      phone: get(r, '手机'),
      email: get(r, '邮箱'),
      address: get(r, '家庭住址'),
      category: get(r, '人员类别'),
      joinDate: get(r, '加入党组织日期'),
      confirmDate: get(r, '转正日期'),
    }));
}

/** 组装某党员的自定义字段值(只放非空有效值) */
function buildCustomFields(r: Rec): Record<string, string> {
  const cf: Record<string, string> = {};
  if (r.idCard) cf.id_card_no = r.idCard;
  const g = genderFromId(r.idCard);
  if (g) cf.gender = g;
  const b = birthFromId(r.idCard);
  if (b) cf.birth_date = b;
  if (r.address) cf.address = r.address;
  const pol = CATEGORY_TO_POLITICAL[r.category];
  if (pol) cf.political_status = pol;
  const jd = normDate(r.joinDate);
  if (jd) cf.party_join_date = jd;
  const cd = normDate(r.confirmDate);
  if (cd) cf.party_confirm_date = cd;
  return cf;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  console.log('━━━━ 党员真实数据导入 ━━━━');
  console.log(`模式:${COMMIT ? '★ 写库(--commit)' : 'dry-run(只打印,不写库)'}`);
  console.log(`源文件:${XLSX_PATH}\n`);

  const recs = readRecords();
  console.log(`读到 ${recs.length} 条党员记录`);

  const abort: string[] = [];
  const warn: string[] = [];

  // ── 必填校验(员工编号 / 姓名 / 所在支部)──
  const missKey = recs.filter((r) => !r.empNo || !r.name || !r.branch);
  if (missKey.length) {
    abort.push(
      `有 ${missKey.length} 行缺员工编号/姓名/所在支部(必填),首例第 ${missKey[0].rowNo} 行`,
    );
  }

  // ── 文件内员工编号唯一性 ──
  const byEmp = new Map<string, Rec[]>();
  for (const r of recs) {
    if (!r.empNo) continue;
    (byEmp.get(r.empNo) ?? byEmp.set(r.empNo, []).get(r.empNo)!).push(r);
  }
  const dupEmp = [...byEmp.entries()].filter(([, a]) => a.length > 1);
  if (dupEmp.length) {
    abort.push(
      `文件内员工编号重复 ${dupEmp.length} 组(需唯一才能建号):` +
        dupEmp.slice(0, 10).map(([e]) => e).join(', '),
    );
  }

  // ── 身份证 / 性别 ──
  const badId = recs.filter((r) => r.idCard && !/^\d{17}[\dXx]$/.test(r.idCard));
  let male = 0,
    female = 0,
    noGender = 0;
  for (const r of recs) {
    const g = genderFromId(r.idCard);
    if (g === 'male') male++;
    else if (g === 'female') female++;
    else noGender++;
  }
  if (badId.length) warn.push(`身份证格式异常 ${badId.length} 条(无法推性别/出生日期,仍会建号)`);

  // ── 文件内邮箱去重(User.email 唯一约束:重复邮箱只给首见者,其余置空)──
  const emailFirst = new Map<string, string>(); // email → 首见 empNo
  const emailBlocked = new Set<string>(); // 需置空的 empNo(邮箱被占)
  const dupEmailSet = new Set<string>();
  for (const r of recs) {
    if (!r.email) continue;
    const first = emailFirst.get(r.email);
    if (first === undefined) emailFirst.set(r.email, r.empNo);
    else {
      emailBlocked.add(r.empNo);
      dupEmailSet.add(r.email);
    }
  }
  if (dupEmailSet.size) {
    warn.push(
      `文件内邮箱重复 ${dupEmailSet.size} 个(唯一约束,仅首见者保留,其余 ${emailBlocked.size} 人邮箱置空):` +
        [...dupEmailSet].slice(0, 5).join(', '),
    );
  }

  // ── 党组织(按全称)解析 ──
  const partyOrgs = await prisma.organization.findMany({
    where: { kind: 'party' },
    select: { id: true, fullName: true },
  });
  const fnToOrg = new Map<string, string[]>();
  for (const o of partyOrgs) {
    if (o.fullName) (fnToOrg.get(o.fullName) ?? fnToOrg.set(o.fullName, []).get(o.fullName)!).push(o.id);
  }
  const dupFN = [...fnToOrg.entries()].filter(([, a]) => a.length > 1);
  if (dupFN.length) {
    abort.push(`DB 党组织全称歧义 ${dupFN.length} 个(无法唯一匹配):` + dupFN.slice(0, 5).map(([n]) => n).join(' / '));
  }
  const distinctBranch = [...new Set(recs.map((r) => r.branch).filter(Boolean))];
  const unmatchedBranch = distinctBranch.filter((b) => !fnToOrg.has(b));
  if (unmatchedBranch.length) {
    // 不硬中止:匹配不到的支部,其党员仍建号,只是不挂党组织归属(记为告警)
    const cnt = (b: string) => recs.filter((r) => r.branch === b).length;
    warn.push(
      `有 ${unmatchedBranch.length} 个「所在支部」在库中按全称匹配不到(这些党员会建号但不挂党组织归属):\n` +
        unmatchedBranch.slice(0, 20).map((b) => `      · [${cnt(b)}人] ${b}`).join('\n'),
    );
  }

  // ── 现有用户(按员工编号)──
  const allEmp = [...byEmp.keys()];
  const existingUsers: { id: string; username: string }[] = [];
  for (const c of chunk(allEmp, 1000)) {
    existingUsers.push(
      ...(await prisma.user.findMany({ where: { username: { in: c } }, select: { id: true, username: true } })),
    );
  }
  const existSet = new Set(existingUsers.map((u) => u.username));
  const toCreate = recs.filter((r) => r.empNo && !existSet.has(r.empNo));
  const toUpdate = recs.filter((r) => r.empNo && existSet.has(r.empNo));

  // ── 打印计划 ──
  console.log('\n── 计划 ──');
  console.log(`党员总数:${recs.length}(新建用户 ${toCreate.length}、已存在补全 ${toUpdate.length})`);
  console.log(`性别推导:男 ${male}、女 ${female}、无法推导 ${noGender}`);
  const catDist: Record<string, number> = {};
  for (const r of recs) catDist[r.category || '(空)'] = (catDist[r.category || '(空)'] ?? 0) + 1;
  console.log(`人员类别:${Object.entries(catDist).map(([k, v]) => `${k} ${v}`).join('、')}`);
  console.log(`所在支部:文件内 ${distinctBranch.length} 个,精确匹配党组织 ${distinctBranch.length - unmatchedBranch.length},匹配不到 ${unmatchedBranch.length}`);
  console.log(`将补默认字段定义:${EXTRA_FIELDS.map((f) => `${f.code}(${f.label})`).join('、')}`);
  console.log(`守卫:必填缺失 ${missKey.length}、编号重复 ${dupEmp.length}、全称歧义 ${dupFN.length}`);

  if (warn.length) {
    console.log('\n⚠ 告警(不中止):');
    for (const w of warn) console.log('  · ' + w);
  }
  if (abort.length) {
    console.error('\n✗ 存在阻断问题,已中止(未写库):');
    for (const a of abort) console.error('  · ' + a);
    process.exitCode = 1;
    return;
  }
  if (!COMMIT) {
    console.log('\n(dry-run 结束,如无异常请加 --commit 写库)');
    return;
  }

  // ═══════════════ 写库 ═══════════════
  console.log('\n── 写库 ──');

  // Phase 0:补两个日期自定义字段定义(幂等 upsert)
  for (const f of EXTRA_FIELDS) {
    await prisma.userCustomField.upsert({
      where: { code: f.code },
      create: { code: f.code, label: f.label, type: f.type, sortOrder: f.sortOrder, active: true, builtin: true },
      update: { label: f.label, type: f.type, sortOrder: f.sortOrder },
    });
  }
  console.log(`✓ Phase 0:补自定义字段定义 ${EXTRA_FIELDS.length} 个`);

  const emailOf = (r: Rec): string | null =>
    r.email && !emailBlocked.has(r.empNo) ? r.email : null;

  // Phase 1:批量建新用户(createMany skipDuplicates;customFields 建号时一并写入)
  let created = 0;
  for (const c of chunk(toCreate, 500)) {
    const res = await prisma.user.createMany({
      data: c.map((r) => {
        const cf = buildCustomFields(r);
        return {
          username: r.empNo,
          name: r.name,
          email: emailOf(r),
          phone: r.phone || null,
          active: true,
          customFields: Object.keys(cf).length ? JSON.stringify(cf) : null,
        };
      }),
      skipDuplicates: true,
    });
    created += res.count;
  }
  console.log(`✓ Phase 1:新建用户 ${created} / ${toCreate.length}`);

  // Phase 2:已存在用户补全(逐条 update:姓名/手机/邮箱 + 合并 customFields)
  const existIdByName = new Map(existingUsers.map((u) => [u.username, u.id]));
  let updated = 0,
    emailSkipped = 0;
  for (const r of toUpdate) {
    const id = existIdByName.get(r.empNo)!;
    const before = await prisma.user.findUnique({ where: { id }, select: { customFields: true } });
    let prevCf: Record<string, string> = {};
    if (before?.customFields) {
      try {
        prevCf = JSON.parse(before.customFields);
      } catch {
        prevCf = {};
      }
    }
    const cf = { ...prevCf, ...buildCustomFields(r) }; // 文件值覆盖占位、保留其它已有键
    const wantEmail = emailOf(r);
    // 邮箱唯一:被别的用户占用则跳过邮箱(不阻断其它字段更新)
    let email: string | null | undefined = wantEmail ?? undefined;
    if (wantEmail) {
      const clash = await prisma.user.findFirst({ where: { email: wantEmail, NOT: { id } }, select: { id: true } });
      if (clash) {
        email = undefined;
        emailSkipped++;
      }
    }
    try {
      await prisma.user.update({
        where: { id },
        data: {
          name: r.name,
          phone: r.phone || undefined,
          email,
          customFields: Object.keys(cf).length ? JSON.stringify(cf) : null,
        },
      });
      updated++;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // 邮箱并发冲突兜底:退回不改邮箱重试
        await prisma.user.update({
          where: { id },
          data: { name: r.name, phone: r.phone || undefined, customFields: Object.keys(cf).length ? JSON.stringify(cf) : null },
        });
        updated++;
        emailSkipped++;
      } else throw e;
    }
  }
  console.log(`✓ Phase 2:补全已存在用户 ${updated}(其中邮箱被占跳过 ${emailSkipped})`);

  // 重新取全部文件用户 id
  const idByEmp = new Map<string, string>();
  for (const c of chunk(allEmp, 1000)) {
    const us = await prisma.user.findMany({ where: { username: { in: c } }, select: { id: true, username: true } });
    for (const u of us) idByEmp.set(u.username, u.id);
  }
  const materialized = allEmp.filter((e) => idByEmp.has(e));
  if (materialized.length !== allEmp.length) {
    console.error(`  ⚠ 有 ${allEmp.length - materialized.length} 个员工编号建号后仍找不到(异常,请检查唯一约束)`);
  }

  // Phase 3:党组织归属(每人 1 条,isPrimary=true)。仅给「当前无任何党组织归属」的用户建,重跑幂等。
  const userIds = [...idByEmp.values()];
  const hasParty = new Set<string>();
  for (const c of chunk(userIds, 1000)) {
    const ms = await prisma.userOrganization.findMany({
      where: { userId: { in: c }, org: { kind: 'party' } },
      select: { userId: true },
    });
    for (const m of ms) hasParty.add(m.userId);
  }
  const memRows: Prisma.UserOrganizationCreateManyInput[] = [];
  let noOrg = 0;
  for (const r of recs) {
    const uid = idByEmp.get(r.empNo);
    if (!uid || hasParty.has(uid)) continue;
    const orgIds = fnToOrg.get(r.branch);
    if (!orgIds || orgIds.length !== 1) {
      noOrg++;
      continue;
    }
    memRows.push({ userId: uid, orgId: orgIds[0], isPrimary: true, position: null });
  }
  let memCreated = 0;
  for (const c of chunk(memRows, 1000)) {
    const res = await prisma.userOrganization.createMany({ data: c, skipDuplicates: true });
    memCreated += res.count;
  }
  console.log(`✓ Phase 3:新增党组织归属 ${memCreated}(已有归属跳过 ${hasParty.size}、无法匹配支部 ${noOrg})`);

  // Phase 4:无任何角色的用户补 member(scope=self)
  const member = await prisma.role.findUnique({ where: { code: 'member' } });
  if (!member) {
    console.error('  ⚠ 缺少 member 角色,跳过角色赋予(请先 npm run db:seed)');
  } else {
    const roled = new Set<string>();
    for (const c of chunk(userIds, 1000)) {
      const rs = await prisma.userRole.findMany({ where: { userId: { in: c } }, select: { userId: true } });
      for (const x of rs) roled.add(x.userId);
    }
    const roleRows = userIds
      .filter((uid) => !roled.has(uid))
      .map((uid) => ({ userId: uid, roleId: member.id, scope: 'self' }));
    let roleCreated = 0;
    for (const c of chunk(roleRows, 1000)) {
      const res = await prisma.userRole.createMany({ data: c, skipDuplicates: true });
      roleCreated += res.count;
    }
    console.log(`✓ Phase 4:补默认 member 角色 ${roleCreated}(已有角色跳过 ${roled.size})`);
  }

  // 审计
  await prisma.auditLog.create({
    data: {
      action: 'import.party_members',
      actorName: '系统导入(党员.xlsx)',
      detail: JSON.stringify({
        total: recs.length,
        created,
        updated,
        memberships: memCreated,
        male,
        female,
        source: path.basename(XLSX_PATH),
      }),
    },
  });

  console.log('\n━━━━ 完成 ━━━━');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
