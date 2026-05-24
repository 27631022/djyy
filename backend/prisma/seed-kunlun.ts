/**
 * 昆仑物流真实组织数据 — 独立 seed 入口。
 *
 * 用途:把 `fixtures/kunlun-logistics-orgs.ts` 中固定的 47 行政 + 47 党组织
 * 写入数据库。与默认 demo seed (seed.ts) 并行,可单独执行或叠加运行。
 *
 *   npm run db:seed:kunlun
 *
 * 行为:
 *  1. 先清空所有 code 以「KL-」开头的旧节点(叶子优先,避免 FK 冲突)
 *  2. 然后按 fixture 顺序 upsert(parent 先于 child,fixture 已排好)
 *
 * 不删别的 org —— 只动 KL-* 前缀的记录,demo seed 数据安全。
 *
 * 注意:如果 KL-* 节点上已经挂了 UserOrganization 记录(成员加入了某个昆仑组织),
 * 清理会因 FK 约束失败。这种情况意味着真的有人在用这些数据 —— 不要重 seed
 * 而要 migrate。
 */
import { PrismaClient } from '@prisma/client';
import {
  KUNLUN_ADMIN_ORGS,
  KUNLUN_PARTY_ORGS,
  type KunlunAdminSeed,
  type KunlunPartySeed,
} from './fixtures/kunlun-logistics-orgs';

const prisma = new PrismaClient();

/** 反复删叶子直到 KL-* 全部清空 */
async function purgeAllKL(): Promise<number> {
  let totalDeleted = 0;
  // 设 100 轮兜底,树深度 << 100
  for (let i = 0; i < 100; i++) {
    const leaves = await prisma.organization.findMany({
      where: {
        code: { startsWith: 'KL-' },
        children: { none: {} },
      },
      select: { id: true },
    });
    if (leaves.length === 0) break;
    const r = await prisma.organization.deleteMany({
      where: { id: { in: leaves.map((l) => l.id) } },
    });
    totalDeleted += r.count;
  }
  return totalDeleted;
}

async function upsertOrg(
  node: KunlunAdminSeed | KunlunPartySeed,
  kind: 'admin' | 'party',
  parentIdByCode: Map<string, string>,
): Promise<void> {
  const parentId = node.parentCode
    ? (parentIdByCode.get(node.parentCode) ?? null)
    : null;
  if (node.parentCode && !parentId) {
    throw new Error(
      `[seed-kunlun] node ${node.code} 的父节点 ${node.parentCode} 未找到 —— 数据顺序错误?`,
    );
  }
  // 行政侧的 KunlunAdminSeed 可能带 isVirtual,党侧 KunlunPartySeed 默认 false
  const isVirtual =
    (node as KunlunAdminSeed).isVirtual === true ? true : false;
  const data = {
    name: node.shortName,
    fullName: node.fullName,
    code: node.code,
    kind,
    type: node.type,
    isVirtual,
    sortOrder: node.sortOrder,
    active: true,
    parentId,
  };
  const existing = await prisma.organization.findUnique({
    where: { code: node.code },
  });
  const saved = existing
    ? await prisma.organization.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.organization.create({ data });
  parentIdByCode.set(node.code, saved.id);
}

async function main() {
  console.log('━━━━ 昆仑物流组织 seed 开始 ━━━━');

  const purged = await purgeAllKL();
  if (purged > 0) {
    console.log(`  ✓ 清理旧 KL-* 节点 ${purged} 条`);
  }

  /* 行政机构:1 root + 1 公司机关 + 1 基层单位(虚拟) + 11 机关 L3 + 34 基层 L3 = 48 条 */
  const adminMap = new Map<string, string>();
  for (const node of KUNLUN_ADMIN_ORGS) {
    await upsertOrg(node, 'admin', adminMap);
  }
  console.log(`  ✓ 行政机构 ${KUNLUN_ADMIN_ORGS.length} 条已 upsert`);

  /* 党组织:1 root + 1 公司机关党委 + 34 L2 + 11 L3 = 47 条 */
  const partyMap = new Map<string, string>();
  for (const node of KUNLUN_PARTY_ORGS) {
    await upsertOrg(node, 'party', partyMap);
  }
  console.log(`  ✓ 党组织 ${KUNLUN_PARTY_ORGS.length} 条已 upsert`);

  console.log('━━━━ 昆仑物流组织 seed 完成 ━━━━');
}

main()
  .catch((e) => {
    console.error('[seed-kunlun] 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
