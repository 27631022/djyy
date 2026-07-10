/**
 * 党组织真实数据导入 — 一次性迁移脚本(独立 tsx 入口,不经 Nest DI / 通用 ImportService)。
 *
 * 把 `功能参考文件夹/导入单位姓名/党组织.xlsx`(35 党委 + 1 党总支 + 361 党支部)载入库:
 *   1. 现有 35 党委 + 1 党总支 —— 按「简称」匹配现库,只更新 code(占位码→官方点分码)+ fullName(官方全称),
 *      name(简称)与 sortOrder(顺序)、type、parentId 一律不动。
 *   2. 361 党支部 —— 按「上级编码」拓扑新建;同一父节点下按「编码」升序定序(sortOrder),
 *      已存在的党支部也会按编码重排(幂等:code 已存在则不重复建,只在排序号变化时更新)。
 *   3. 彻底删除 13 个演示党支部(code 前缀 KL-PARTY-L3-,先删其成员归属再删组织);
 *      临时党支部(VPARTY-*)保留。
 *
 * 用法(cwd = backend):
 *   npx tsx prisma/import-party-orgs.ts                # dry-run,只打印计划不写库
 *   npx tsx prisma/import-party-orgs.ts --commit       # 真正写库
 *   npx tsx prisma/import-party-orgs.ts --commit path/to/党组织.xlsx   # 指定源文件
 *
 * ⚠ 迁移后不要再对同一库跑 `npm run db:seed` / `db:seed:kunlun`:它们按 KL-PARTY-ROOT 等
 *   字符串码找父/建节点,换码后会失败或建重复。现有关系不受影响(FK 走 id 不走 code)。
 *   重置流程:prisma migrate reset → db:seed → db:seed:kunlun → db:import:party(导入后不再 seed)。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
// 第一个非 --flag 且以 .xls(x) 结尾的参数视为源文件路径
const argPath = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.xlsx?$/i.test(a));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // backend/prisma → 仓库根
const XLSX_PATH = argPath
  ? path.resolve(argPath)
  : path.join(REPO_ROOT, '功能参考文件夹', '导入单位姓名', '党组织.xlsx');
const SHEET_NAME = '党组织';

// 文件里的党组织简称 → 现库 name(同一组织,名字略有出入)
const ALIAS: Record<string, string> = {
  哈萨克斯坦分公司党总支: '哈萨克分公司党总支',
};
// 现库 13 个演示党支部的 code 前缀(机关第一~十一 / 机关党支部 / 特车运输大队,均为 seed 假数据)
const DEMO_BRANCH_PREFIX = 'KL-PARTY-L3-';

// 层级(中文)→ Organization.type
const LEVEL_TO_TYPE: Record<string, 'committee' | 'general' | 'branch'> = {
  党委: 'committee',
  党总支: 'general',
  党支部: 'branch',
};

interface Row {
  rowNo: number;
  code: string;
  name: string; // 简称
  fullName: string; // 全称
  level: string; // 党委/党总支/党支部
  parentCode: string | null;
}

function s(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

function readRows(): Row[] {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`源文件不存在:${XLSX_PATH}`);
  }
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { type: 'buffer' });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Excel 里没有工作表「${SHEET_NAME}」,实际有:${wb.SheetNames.join(', ')}`);
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return raw.map((r, i) => ({
    rowNo: i + 2, // 表头占第 1 行
    code: s(r['组织编码']),
    name: s(r['党组织简称']),
    fullName: s(r['党组织全称']),
    level: s(r['层级']),
    parentCode: s(r['上级编码']) || null,
  }));
}

async function main() {
  console.log('━━━━ 党组织真实数据导入 ━━━━');
  console.log(`模式:${COMMIT ? '★ 写库(--commit)' : 'dry-run(只打印,不写库)'}`);
  console.log(`源文件:${XLSX_PATH}\n`);

  const rows = readRows();
  const committeesFile = rows.filter((r) => r.level === '党委' || r.level === '党总支');
  const branchesFile = rows.filter((r) => r.level === '党支部');
  const unknownLevel = rows.filter((r) => !LEVEL_TO_TYPE[r.level]);
  console.log(`读到 ${rows.length} 行:党委/党总支 ${committeesFile.length}、党支部 ${branchesFile.length}` +
    (unknownLevel.length ? `、未知层级 ${unknownLevel.length}` : ''));

  const abort: string[] = [];
  if (unknownLevel.length) {
    abort.push(`有 ${unknownLevel.length} 行层级无法识别(需为 党委/党总支/党支部),首行示例第 ${unknownLevel[0].rowNo} 行「${unknownLevel[0].level}」`);
  }

  // ── 现库党组织 ──
  const dbParty = await prisma.organization.findMany({
    where: { kind: 'party' },
    select: { id: true, name: true, fullName: true, code: true, type: true, sortOrder: true },
  });
  const existingCodes = new Set(dbParty.map((o) => o.code));

  // 仅在 committee/general 子集内按 name 建索引,并断言无重名
  const nameToRows = new Map<string, typeof dbParty>();
  for (const o of dbParty) {
    if (o.type !== 'committee' && o.type !== 'general') continue;
    const arr = nameToRows.get(o.name) ?? [];
    arr.push(o);
    nameToRows.set(o.name, arr);
  }
  const dupNames = [...nameToRows.entries()].filter(([, arr]) => arr.length > 1);
  if (dupNames.length) {
    abort.push(`现库党委/党总支存在重名,无法按名匹配:${dupNames.map(([n]) => n).join('、')}`);
  }

  // ── Phase 0a:匹配党委/党总支 ──
  interface Matched {
    id: string;
    fileName: string;
    dbName: string;
    oldCode: string;
    newCode: string;
    oldFullName: string;
    newFullName: string;
  }
  const matched: Matched[] = [];
  const unmatched: Row[] = [];
  for (const r of committeesFile) {
    const dbName = ALIAS[r.name] ?? r.name;
    const hit = nameToRows.get(dbName);
    if (!hit || hit.length !== 1) {
      unmatched.push(r);
      continue;
    }
    const o = hit[0];
    matched.push({
      id: o.id,
      fileName: r.name,
      dbName: o.name,
      oldCode: o.code,
      newCode: r.code,
      oldFullName: o.fullName ?? '',
      newFullName: r.fullName,
    });
  }
  if (unmatched.length) {
    abort.push(
      `有 ${unmatched.length} 个文件党委/党总支在现库按简称匹配不上(不会静默新建):\n` +
        unmatched.map((r) => `    · ${r.name}(${r.level},code ${r.code})`).join('\n'),
    );
  }

  // ── Phase 0b:编码冲突守卫 ──
  // 目标官方码若已在库,必须属于刚匹配到的那一行(重跑幂等),否则中止
  const matchedIdByNewCode = new Map(matched.map((m) => [m.newCode, m.id]));
  const dbIdByCode = new Map(dbParty.map((o) => [o.code, o.id]));
  const codeConflicts: string[] = [];
  for (const m of matched) {
    if (m.newCode === m.oldCode) continue; // 重跑:已是官方码
    const holderId = dbIdByCode.get(m.newCode);
    if (holderId && holderId !== m.id) {
      codeConflicts.push(`官方码 ${m.newCode}(拟给「${m.dbName}」)已被库中另一组织占用`);
    }
  }
  if (codeConflicts.length) abort.push(codeConflicts.join('\n    '));

  // ── Phase 0c:党支部父解析 + 按编码定序 + toCreate/toResort ──
  const officialCommitteeCodes = new Set(matched.map((m) => m.newCode));
  const fileBranchCodes = new Set(branchesFile.map((b) => b.code));
  const parentResolvable = (pc: string) =>
    officialCommitteeCodes.has(pc) || fileBranchCodes.has(pc) || existingCodes.has(pc);

  // 同一父节点下的党支部按「编码」升序定序(点分码定宽 hex → 字符串序 = 编码序);
  // 党委/党总支顺序不动,只按编码排党支部。sortOrder = 同父内序号 × 10。
  const byParentCode = new Map<string, Row[]>();
  for (const b of branchesFile) {
    const key = b.parentCode ?? '(root)';
    const arr = byParentCode.get(key) ?? [];
    arr.push(b);
    byParentCode.set(key, arr);
  }
  const sortOrderByCode = new Map<string, number>();
  for (const arr of byParentCode.values()) {
    arr.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    arr.forEach((b, i) => sortOrderByCode.set(b.code, (i + 1) * 10));
  }

  const dbByCode = new Map(dbParty.map((o) => [o.code, o]));
  const unresolved: Row[] = [];
  interface BranchPlan extends Row {
    sortOrder: number;
    exists: boolean;
  }
  const branchPlans: BranchPlan[] = branchesFile.map((b) => {
    if (b.parentCode && !parentResolvable(b.parentCode)) unresolved.push(b);
    return { ...b, sortOrder: sortOrderByCode.get(b.code) ?? 0, exists: existingCodes.has(b.code) };
  });
  if (unresolved.length) {
    abort.push(
      `有 ${unresolved.length} 个党支部的上级编码在库中和本表中都找不到:\n` +
        unresolved.slice(0, 20).map((b) => `    · ${b.name}(code ${b.code},上级 ${b.parentCode})`).join('\n'),
    );
  }
  const toCreate = branchPlans.filter((b) => !b.exists);
  // 已存在但排序号与「按编码定序」不一致 → 需重排(只改 sortOrder)
  const toResort = branchPlans.filter((b) => {
    const db = dbByCode.get(b.code);
    return db !== undefined && db.sortOrder !== b.sortOrder;
  });

  // ── Phase 0d:待删演示党支部 ──
  const demoBranches = await prisma.organization.findMany({
    where: { kind: 'party', type: 'branch', code: { startsWith: DEMO_BRANCH_PREFIX } },
    select: { id: true, name: true, code: true, _count: { select: { memberships: true } } },
  });
  const demoMemberCount = demoBranches.reduce((sum, o) => sum + o._count.memberships, 0);

  // ── 打印计划 ──
  console.log('\n── 计划 ──');
  console.log(`党委/党总支匹配:${matched.length} / ${committeesFile.length}(匹配不上 ${unmatched.length})`);
  const fullNameDiffs = matched.filter((m) => m.oldFullName !== m.newFullName);
  console.log(`  · 需改编码:${matched.filter((m) => m.oldCode !== m.newCode).length}`);
  console.log(`  · 需改全称:${fullNameDiffs.length}`);
  for (const m of fullNameDiffs) {
    console.log(`      「${m.dbName}」全称:${m.oldFullName || '(空)'}  →  ${m.newFullName}`);
  }
  console.log(`党支部:待新建 ${toCreate.length}、待按编码重排 ${toResort.length}(党委/党总支顺序不动)`);
  console.log(`演示党支部:待删除 ${demoBranches.length} 个(级联删成员归属 ${demoMemberCount} 条)`);
  console.log(`守卫:匹配不上 ${unmatched.length}、父解析不到 ${unresolved.length}、编码冲突 ${codeConflicts.length}`);

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

  // ── Phase 1:更新党委/党总支(只改 code + fullName)──
  console.log('\n── 写库 ──');
  if (matched.length) {
    await prisma.$transaction(
      matched.map((m) =>
        prisma.organization.update({
          where: { id: m.id },
          data: { code: m.newCode, fullName: m.newFullName },
        }),
      ),
    );
  }
  console.log(`✓ Phase 1:更新党委/党总支 ${matched.length} 条(code + 全称)`);

  // ── Phase 2:拓扑新建党支部 ──
  // 从库重读一次拿到最新 code→id(党委已换官方码)
  const afterP1 = await prisma.organization.findMany({ where: { kind: 'party' }, select: { id: true, code: true } });
  const codeToId = new Map(afterP1.map((o) => [o.code, o.id]));
  let remaining = toCreate.filter((b) => !codeToId.has(b.code));
  let created = 0;
  let progressed = true;
  while (remaining.length && progressed) {
    progressed = false;
    const blocked: BranchPlan[] = [];
    for (const b of remaining) {
      const parentId = b.parentCode ? codeToId.get(b.parentCode) ?? null : null;
      if (b.parentCode && !parentId) {
        blocked.push(b);
        continue;
      }
      const org = await prisma.organization.create({
        data: {
          code: b.code,
          name: b.name,
          fullName: b.fullName || null,
          kind: 'party',
          type: 'branch',
          parentId,
          isVirtual: false,
          isDept: false,
          active: true,
          sortOrder: b.sortOrder,
        },
      });
      codeToId.set(b.code, org.id);
      created++;
      progressed = true;
    }
    remaining = blocked;
  }
  console.log(`✓ Phase 2:新建党支部 ${created} 条`);
  if (remaining.length) {
    console.error(`  ✗ 仍有 ${remaining.length} 个党支部父节点无法解析(异常,请检查):` +
      remaining.slice(0, 10).map((b) => b.code).join(', '));
  }

  // ── Phase 2b:按编码重排已存在的党支部(只改 sortOrder,不动名称/全称/父)──
  if (toResort.length) {
    await prisma.$transaction(
      toResort.map((b) =>
        prisma.organization.update({ where: { id: dbByCode.get(b.code)!.id }, data: { sortOrder: b.sortOrder } }),
      ),
    );
  }
  console.log(`✓ Phase 2b:按编码重排党支部 ${toResort.length} 条`);

  // ── Phase 3:彻底删除演示党支部(先删成员归属,再删组织)──
  if (demoBranches.length) {
    const ids = demoBranches.map((o) => o.id);
    const delMem = await prisma.userOrganization.deleteMany({ where: { orgId: { in: ids } } });
    const delOrg = await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    console.log(`✓ Phase 3:删除演示党支部 ${delOrg.count} 个、成员归属 ${delMem.count} 条`);
  } else {
    console.log('✓ Phase 3:无演示党支部待删(可能已删)');
  }

  console.log('\n━━━━ 完成 ━━━━');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
