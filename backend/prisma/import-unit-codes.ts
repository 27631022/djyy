/**
 * 二级单位编码更新 —— 一次性脚本(独立 tsx 入口)。
 *
 * 源文件 `导入单位姓名/二级单位.xlsx`(列:二级报表单位 | 组织单位编码),把现库 34 个分公司 + 公共事务中心/
 * 教育培训中心/华油信通/物资分公司 等**二级单位**的占位码(seed 的 `KL-ADMIN-L3-BASE-*`)更新为真实 8 位码。
 *
 * 匹配:文件「二级报表单位」名 → 现库「基层单位/公司机关」壳下的直接子级(与 import-admin-orgs 同一套 ALIAS)。
 * 守卫:新码若已被**其它**组织占用(code 全局唯一)→ 跳过并告警,不硬改。
 * ⚠ 公共事务中心 文件里有 3 个码(本级 50119921 / 文体中心 50119931 / 社保中心 65106334)——
 *   节点只取**首个(本级)** 50119921;文体/社保是子机构(树里没有),其员工留在待分配人员。
 *
 * 用法(cwd = backend):
 *   npx tsx prisma/import-unit-codes.ts            # dry-run
 *   npx tsx prisma/import-unit-codes.ts --commit   # 写库
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const argPath = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.xlsx?$/i.test(a));
const FILE_PATH = argPath ? path.resolve(argPath) : 'C:/Users/zhangming/Desktop/导入单位姓名/二级单位.xlsx';

// 文件「二级报表单位」名 → 现库二级单位名(与 import-admin-orgs / import-employees 同一套)
const ALIAS: Record<string, string> = {
  教培中心: '教育培训中心',
  华北运输公司: '华北运输分公司',
  哈萨克斯坦分公司: '哈萨克分公司',
  江苏分公司: '苏皖分公司',
  湖北分公司: '湘鄂分公司',
  福建分公司: '闽赣分公司',
  云南分公司: '云贵分公司',
  陕西分公司: '陕豫分公司',
};

function s(v: unknown): string {
  return String(v ?? '').trim();
}
function norm(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, '').trim();
}

async function main() {
  console.log('━━━━ 二级单位编码更新 ━━━━');
  console.log(`模式:${COMMIT ? '★ 写库(--commit)' : 'dry-run(只打印,不写库)'}`);
  console.log(`源文件:${FILE_PATH}\n`);

  if (!fs.existsSync(FILE_PATH)) throw new Error(`源文件不存在:${FILE_PATH}`);
  const wb = XLSX.read(fs.readFileSync(FILE_PATH), { type: 'buffer' });
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false });
  const hIdx = aoa.findIndex((r) => r.map(s).includes('二级报表单位') && r.map(s).includes('组织单位编码'));
  if (hIdx < 0) throw new Error('未找到表头(需含「二级报表单位」「组织单位编码」)');
  const header = aoa[hIdx].map(s);
  const nameCol = header.indexOf('二级报表单位');
  const codeCol = header.indexOf('组织单位编码');
  const fileRows = aoa
    .slice(hIdx + 1)
    .map((r) => ({ name: s(r[nameCol]), code: s(r[codeCol]) }))
    .filter((r) => r.name && r.code);

  // 同名多码 → 只取首个(本级);记录被丢弃的其它码供报告
  const codeByName = new Map<string, string>();
  const extraCodes = new Map<string, string[]>();
  for (const r of fileRows) {
    if (!codeByName.has(r.name)) codeByName.set(r.name, r.code);
    else (extraCodes.get(r.name) ?? extraCodes.set(r.name, []).get(r.name)!).push(r.code);
  }
  console.log(`读到 ${fileRows.length} 行,去重后 ${codeByName.size} 个二级单位`);
  if (extraCodes.size) {
    console.log('⚠ 同名多码(节点只取首个,其余为子机构、其员工留待分配人员):');
    for (const [n, codes] of extraCodes) console.log(`    ${n}:节点取「${codeByName.get(n)}」,另有子机构码 ${codes.join('、')}`);
  }

  // 现库二级单位候选 = root 下虚拟壳(公司机关/基层单位)的直接子级
  const admin = await prisma.organization.findMany({
    where: { kind: 'admin' },
    select: { id: true, code: true, name: true, isVirtual: true, parentId: true },
  });
  const codeToOrg = new Map(admin.map((o) => [o.code, o]));
  const root = admin.find((o) => !o.parentId);
  const wrappers = admin.filter((o) => o.isVirtual && root && o.parentId === root.id);
  const wrapperIds = new Set(wrappers.map((w) => w.id));
  const level2 = admin.filter((o) => wrapperIds.has(o.parentId ?? ''));
  const byName = new Map<string, typeof level2>();
  for (const o of level2) (byName.get(norm(o.name)) ?? byName.set(norm(o.name), []).get(norm(o.name))!).push(o);

  interface Plan {
    id: string;
    name: string;
    oldCode: string;
    newCode: string;
  }
  const plans: Plan[] = [];
  const notFound: string[] = [];
  const conflicts: string[] = [];
  const already: string[] = [];
  for (const [fileName, newCode] of codeByName) {
    const dbName = ALIAS[fileName] ?? fileName;
    const hits = byName.get(norm(dbName)) ?? [];
    if (hits.length !== 1) {
      notFound.push(`${fileName}${ALIAS[fileName] ? `→${ALIAS[fileName]}` : ''}(壳下命中 ${hits.length} 个)`);
      continue;
    }
    const o = hits[0];
    if (o.code === newCode) {
      already.push(o.name);
      continue;
    }
    const holder = codeToOrg.get(newCode);
    if (holder && holder.id !== o.id) {
      conflicts.push(`新码 ${newCode}(拟给「${o.name}」)已被「${holder.name}」占用`);
      continue;
    }
    plans.push({ id: o.id, name: o.name, oldCode: o.code, newCode });
  }

  console.log(`\n── 计划 ──`);
  console.log(`待更新 ${plans.length}、已是新码 ${already.length}、匹配不到 ${notFound.length}、编码冲突 ${conflicts.length}`);
  for (const p of plans) console.log(`    ${p.name}:${p.oldCode}  →  ${p.newCode}`);
  if (notFound.length) console.log(`  匹配不到:${notFound.join('、')}`);
  if (conflicts.length) console.log(`  ✗ 编码冲突(跳过):\n    ${conflicts.join('\n    ')}`);

  if (!COMMIT) {
    console.log('\n(dry-run 结束,如无异常请加 --commit 写库)');
    return;
  }

  console.log('\n── 写库 ──');
  await prisma.$transaction(plans.map((p) => prisma.organization.update({ where: { id: p.id }, data: { code: p.newCode } })));
  console.log(`✓ 更新二级单位编码 ${plans.length} 个`);
  await prisma.auditLog.create({
    data: {
      action: 'import.unit_codes',
      actorName: '系统导入(二级单位.xlsx)',
      detail: JSON.stringify({ updated: plans.length, already: already.length, notFound: notFound.length, conflicts: conflicts.length }),
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
