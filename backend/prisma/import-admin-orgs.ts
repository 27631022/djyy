/**
 * 行政机构真实数据导入 —— 一次性迁移脚本(独立 tsx 入口,不经 Nest DI / 通用 ImportService)。
 *
 * 源文件 `功能参考文件夹/导入单位姓名/行政机构.xls`(实为 GBK 制表符文本,非二进制 Excel),
 * 558 行 = 34 个分公司(二级报表单位)各自的「本部职能部门 + 三级单位」,列:
 *   序号 | 二级报表单位 | 组织单位编码(8 位) | 组织单位 | 机构层次
 * 机构层次只有两种:二级单位本部职能部门(部门)/ 三级单位。
 *
 * 落库规则(与用户 2026-07-08 确认一致):
 *   1. 34 个分公司(二级单位)+ 公司机关:编码/顺序一律不动(文件无其编码),只在其下导入部门+三级单位。
 *   2. 机构层次拆解:二级单位本部职能部门 → 部门(isDept=true);三级单位 → 非部门(isDept=false)。
 *   3. 父 = 「二级报表单位」列匹配到的分公司(8 位码非层级式,只用于排序,不用于定父)。
 *      每个分公司下:部门在前、三级单位在后,各自按编码升序(sortOrder = 序号×10)。
 *   4. 8 个改名/简称单位按别名映射到现库单位、保留现库名(党/政树一致)。
 *   5. 层级模型:虚拟壳(公司机关/基层单位,level2)下的直接子级 = 二级单位(level2,含 34 分公司 + 公司机关的机关部门),
 *      其下全部 = 三级单位(level3);全 admin 不用 level4。导入后 Phase 3 按此归位(壳下直接子级→level2、其下→level3、清残留 level4)。
 *   6. 匹配:文件行按 code 或(父,名)命中现库 → 更新(code/isDept/sortOrder/type);否则新建。
 *      分公司现有的、文件里没有的子项(演示/测试节点)→ 只报告,不删除。
 *
 * 用法(cwd = backend):
 *   npx tsx prisma/import-admin-orgs.ts            # dry-run,只打印计划不写库
 *   npx tsx prisma/import-admin-orgs.ts --commit   # 真正写库
 *   npx tsx prisma/import-admin-orgs.ts --commit path/to/行政机构.xls
 *
 * ⚠ 与 import-party-orgs 一样,迁移后别对同一库重跑 seed(seed 按 KL-* 字符串码建节点会失败/建重复)。
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
const argPath = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.xlsx?$/i.test(a));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_PATH = argPath
  ? path.resolve(argPath)
  : path.join(REPO_ROOT, '功能参考文件夹', '导入单位姓名', '行政机构.xls');

// 文件「二级报表单位」名 → 现库分公司名(视为同一单位,保留现库名)
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
const DEPT_LEVEL = '二级单位本部职能部门';
const SUB_LEVEL = '三级单位';

interface Row {
  rowNo: number;
  unit2: string;
  code: string;
  org: string;
  level: string;
  isDept: boolean;
}

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').trim();
}

function readRows(): Row[] {
  if (!fs.existsSync(FILE_PATH)) throw new Error(`源文件不存在:${FILE_PATH}`);
  const buf = fs.readFileSync(FILE_PATH);
  let text: string;
  try {
    text = new TextDecoder('gbk').decode(buf);
  } catch {
    text = new TextDecoder('gb18030').decode(buf);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return lines.slice(1).map((l, i) => {
    const c = l.split('\t');
    const level = (c[4] ?? '').trim();
    return {
      rowNo: i + 2,
      unit2: (c[1] ?? '').trim(),
      code: (c[2] ?? '').trim(),
      org: (c[3] ?? '').trim(),
      level,
      isDept: level === DEPT_LEVEL,
    };
  });
}

async function main() {
  console.log('━━━━ 行政机构真实数据导入 ━━━━');
  console.log(`模式:${COMMIT ? '★ 写库(--commit)' : 'dry-run(只打印,不写库)'}`);
  console.log(`源文件:${FILE_PATH}\n`);

  const rows = readRows();
  console.log(`读到 ${rows.length} 行`);
  const abort: string[] = [];

  // 机构层次校验
  const badLevel = rows.filter((r) => r.level !== DEPT_LEVEL && r.level !== SUB_LEVEL);
  if (badLevel.length) {
    abort.push(`有 ${badLevel.length} 行「机构层次」既不是「${DEPT_LEVEL}」也不是「${SUB_LEVEL}」,首行第 ${badLevel[0].rowNo} 行「${badLevel[0].level}」`);
  }
  const missingCell = rows.filter((r) => !r.unit2 || !r.code || !r.org);
  if (missingCell.length) abort.push(`有 ${missingCell.length} 行缺 二级报表单位/编码/组织单位`);

  // ── 现库 admin ──
  const admin = await prisma.organization.findMany({
    where: { kind: 'admin' },
    select: { id: true, name: true, code: true, type: true, isDept: true, isVirtual: true, parentId: true, sortOrder: true },
  });
  const adminById = new Map(admin.map((o) => [o.id, o]));
  const adminByCode = new Map(admin.map((o) => [o.code, o]));

  // 二级报表单位匹配池 = 虚拟「基层单位」的直接子节点(34 分公司)。
  // 限定池:避免与深层同名节点歧义 —— 如建安公司下也有叫「内蒙古分公司/山东分公司」的三级单位,
  // 全库按名匹配会歧义、破坏重跑幂等;这些真正的二级单位只会挂在「基层单位」壳下。
  const baseWrap = admin.find((o) => o.name === '基层单位' && o.isVirtual);
  if (!baseWrap) abort.push('现库找不到虚拟「基层单位」壳节点,无法定位分公司');
  const unitByName = new Map<string, typeof admin>();
  if (baseWrap) {
    for (const o of admin) {
      if (o.parentId !== baseWrap.id) continue;
      const k = norm(o.name);
      const arr = unitByName.get(k) ?? [];
      arr.push(o);
      unitByName.set(k, arr);
    }
  }

  // ── 二级报表单位 → 分公司 匹配 ──
  const unit2Names = [...new Set(rows.map((r) => r.unit2))];
  const parentIdByUnit2 = new Map<string, string>();
  const unmatchedUnits: string[] = [];
  for (const u of unit2Names) {
    const dbName = ALIAS[u] ?? u;
    const hits = unitByName.get(norm(dbName)) ?? [];
    if (hits.length === 1) parentIdByUnit2.set(u, hits[0].id);
    else unmatchedUnits.push(`${u}${ALIAS[u] ? `→${ALIAS[u]}` : ''}(基层单位下命中 ${hits.length} 条)`);
  }
  if (unmatchedUnits.length) {
    abort.push(`有 ${unmatchedUnits.length} 个二级报表单位在现库匹配不上(不静默新建分公司):\n    ` + unmatchedUnits.join('\n    '));
  }
  const parentIds = new Set(parentIdByUnit2.values());

  // ── 每个分公司下:部门在前、三级单位在后,各按编码升序 → sortOrder ──
  const byParent = new Map<string, Row[]>();
  for (const r of rows) {
    const pid = parentIdByUnit2.get(r.unit2);
    if (!pid) continue;
    const arr = byParent.get(pid) ?? [];
    arr.push(r);
    byParent.set(pid, arr);
  }
  const sortOrderByCode = new Map<string, number>();
  const byCode = (a: Row, b: Row) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  for (const arr of byParent.values()) {
    const depts = arr.filter((r) => r.isDept).sort(byCode);
    const subs = arr.filter((r) => !r.isDept).sort(byCode);
    [...depts, ...subs].forEach((r, i) => sortOrderByCode.set(r.code, (i + 1) * 10));
  }

  // ── 现库「分公司直接子项」按 父+名 建索引(用于按名匹配更新)──
  const childByParentName = new Map<string, typeof admin>();
  for (const o of admin) {
    if (!o.parentId || !parentIds.has(o.parentId)) continue;
    const key = `${o.parentId}|${norm(o.name)}`;
    const arr = childByParentName.get(key) ?? [];
    arr.push(o);
    childByParentName.set(key, arr);
  }

  // ── 计划:每行 create / update ──
  interface Plan {
    row: Row;
    parentId: string;
    sortOrder: number;
    action: 'create' | 'update';
    targetId?: string;
  }
  const plans: Plan[] = [];
  const codeConflicts: string[] = [];
  const ambiguous: string[] = [];
  for (const r of rows) {
    const parentId = parentIdByUnit2.get(r.unit2);
    if (!parentId) continue;
    const sortOrder = sortOrderByCode.get(r.code) ?? 0;
    const hitByCode = adminByCode.get(r.code);
    if (hitByCode) {
      // 重跑:已按 code 存在。父不一致则告警(可能撞了别的节点的 code)
      if (hitByCode.parentId !== parentId) {
        codeConflicts.push(`编码 ${r.code}(拟挂「${adminById.get(parentId)?.name}」)已被现库其它节点「${hitByCode.name}」占用`);
        continue;
      }
      plans.push({ row: r, parentId, sortOrder, action: 'update', targetId: hitByCode.id });
      continue;
    }
    const nameHits = childByParentName.get(`${parentId}|${norm(r.org)}`) ?? [];
    if (nameHits.length === 1) plans.push({ row: r, parentId, sortOrder, action: 'update', targetId: nameHits[0].id });
    else if (nameHits.length === 0) plans.push({ row: r, parentId, sortOrder, action: 'create' });
    else ambiguous.push(`「${r.org}」在「${adminById.get(parentId)?.name}」下现库有 ${nameHits.length} 个同名`);
  }
  if (codeConflicts.length) abort.push(codeConflicts.join('\n    '));
  if (ambiguous.length) abort.push(`按名匹配歧义(现库同名多个):\n    ` + ambiguous.join('\n    '));

  const toCreate = plans.filter((p) => p.action === 'create');
  const toUpdate = plans.filter((p) => p.action === 'update');

  // ── 现库「分公司下、文件里没有的」子项(演示/测试残留)→ 只报告 ──
  const targeted = new Set(toUpdate.map((p) => p.targetId));
  const extras = admin.filter((o) => o.parentId && parentIds.has(o.parentId) && !targeted.has(o.id));

  // ── 打印计划 ──
  console.log('\n── 计划 ──');
  console.log(`二级报表单位匹配:${parentIdByUnit2.size}/${unit2Names.length}(匹配不上 ${unmatchedUnits.length})`);
  console.log(`文件行:部门 ${rows.filter((r) => r.isDept).length}、三级单位 ${rows.filter((r) => !r.isDept).length}`);
  console.log(`落库:新建 ${toCreate.length}、更新(命中现库改编码/部门标记/排序)${toUpdate.length}`);
  console.log(`层级归位:虚拟壳(公司机关/基层单位)下直接子级→二级单位(level2)、其下→三级单位(level3),全 admin 不留 level4`);
  console.log(`守卫:单位匹配不上 ${unmatchedUnits.length}、编码冲突 ${codeConflicts.length}、按名歧义 ${ambiguous.length}、坏层次 ${badLevel.length}`);
  console.log(`\n分公司下「文件里没有的」现有子项(演示/测试残留,本脚本不删,供你核对):${extras.length}`);
  for (const o of extras.slice(0, 40)) {
    console.log(`    · ${adminById.get(o.parentId!)?.name} / ${o.name}  [${o.type}${o.isDept ? ',部门' : ''}] code=${o.code}`);
  }
  if (extras.length > 40) console.log(`    …… 其余 ${extras.length - 40} 个省略`);

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

  // ── 写库 ──
  console.log('\n── 写库 ──');
  if (toUpdate.length) {
    await prisma.$transaction(
      toUpdate.map((p) =>
        prisma.organization.update({
          where: { id: p.targetId },
          data: { code: p.row.code, name: p.row.org, isDept: p.row.isDept, type: 'level3', sortOrder: p.sortOrder },
        }),
      ),
    );
  }
  console.log(`✓ 更新现有子项 ${toUpdate.length} 条(编码/部门标记/排序)`);

  if (toCreate.length) {
    await prisma.$transaction(
      toCreate.map((p) =>
        prisma.organization.create({
          data: {
            code: p.row.code,
            name: p.row.org,
            kind: 'admin',
            type: 'level3',
            isDept: p.row.isDept,
            parentId: p.parentId,
            isVirtual: false,
            active: true,
            sortOrder: p.sortOrder,
          },
        }),
      ),
    );
  }
  console.log(`✓ 新建子项 ${toCreate.length} 条(部门 ${toCreate.filter((p) => p.row.isDept).length}、三级单位 ${toCreate.filter((p) => !p.row.isDept).length})`);

  // ── Phase 3:层级归位 —— 虚拟壳(公司机关/基层单位)下直接子级 = 二级单位(level2)、其下全部 = 三级单位(level3)、全 admin 不用 level4 ──
  const cur = await prisma.organization.findMany({ where: { kind: 'admin' }, select: { id: true, parentId: true, isVirtual: true } });
  const rootAdmin = cur.find((o) => !o.parentId);
  const childrenOf = new Map<string, string[]>();
  for (const o of cur) {
    if (!o.parentId) continue;
    const arr = childrenOf.get(o.parentId) ?? [];
    arr.push(o.id);
    childrenOf.set(o.parentId, arr);
  }
  // 虚拟壳 = root 的虚拟直接子级(公司机关 / 基层单位)
  const wrapperIds = cur.filter((o) => o.isVirtual && rootAdmin && o.parentId === rootAdmin.id).map((o) => o.id);
  // 二级单位 = 壳的直接子级(34 分公司 + 公司机关的机关部门等)
  const l2Ids = wrapperIds.flatMap((w) => childrenOf.get(w) ?? []);
  // 二级单位以下的所有后代 → 三级单位
  const descendants: string[] = [];
  const stack = [...l2Ids];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const c of childrenOf.get(id) ?? []) {
      descendants.push(c);
      stack.push(c);
    }
  }
  const p3a = await prisma.organization.updateMany({ where: { id: { in: l2Ids }, type: { not: 'level2' } }, data: { type: 'level2' } });
  const p3b = descendants.length
    ? await prisma.organization.updateMany({ where: { id: { in: descendants }, type: { not: 'level3' } }, data: { type: 'level3' } })
    : { count: 0 };
  const p3c = await prisma.organization.updateMany({ where: { kind: 'admin', type: 'level4' }, data: { type: 'level3' } });
  console.log(`✓ Phase 3 层级归位:二级单位(壳下直接子级)→level2 ${p3a.count}、其下三级单位→level3 ${p3b.count}、清残留 level4 ${p3c.count}`);

  console.log(`\nℹ 分公司下「文件里没有的」现有子项 ${extras.length} 个未动(如需清理请单独说)。`);
  console.log('\n━━━━ 完成 ━━━━');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
