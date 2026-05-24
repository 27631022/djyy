/**
 * 昆仑物流真实组织数据 — 独立 seed 入口。
 *
 * 用途:把 `fixtures/kunlun-logistics-orgs.ts` 中固定的 46 条单位 + 党组织
 * 写入数据库。与默认 demo seed (seed.ts) 并行,可单独执行或叠加运行。
 *
 *   - npm run db:seed:kunlun       # 仅写昆仑物流组织(不动 demo 用户 / 字典)
 *   - npm run db:seed && npm run db:seed:kunlun  # demo + 真实数据并存
 *
 * upsert 语义:按 code 查找,有则更新,无则创建。重复跑安全。
 * 不删除别的 org —— 这个脚本只追加 / 更新 KL-* 开头的 47 条记录。
 */
import { PrismaClient } from '@prisma/client';
import {
  KUNLUN_ADMIN_ORGS,
  KUNLUN_PARTY_ORGS,
  type KunlunAdminSeed,
  type KunlunPartySeed,
} from './fixtures/kunlun-logistics-orgs';

const prisma = new PrismaClient();

async function upsertOrg(
  node: KunlunAdminSeed | KunlunPartySeed,
  kind: 'admin' | 'party',
  parentIdByCode: Map<string, string>,
): Promise<void> {
  const parentId = node.parentCode ? parentIdByCode.get(node.parentCode) ?? null : null;
  if (node.parentCode && !parentId) {
    throw new Error(
      `[seed-kunlun] node ${node.code} 父节点 ${node.parentCode} 未找到 —— 数据顺序错误?`,
    );
  }
  // 写库时 name 用简称(列表展示用),全称建议未来加 fullName 字段;
  // 当前 Organization 表只有 name 一列,这里取 shortName。
  const data = {
    name: node.shortName,
    code: node.code,
    kind,
    type: node.type,
    isVirtual: false,
    sortOrder: node.sortOrder,
    active: true,
    parentId,
  };
  const existing = await prisma.organization.findUnique({ where: { code: node.code } });
  const saved = existing
    ? await prisma.organization.update({ where: { id: existing.id }, data })
    : await prisma.organization.create({ data });
  parentIdByCode.set(node.code, saved.id);
}

async function main() {
  console.log('━━━━ 昆仑物流组织 seed 开始 ━━━━');

  /* 行政机构 47 条:1 root + 35 L2 + 11 L3(L3 挂公司机关下) */
  const adminMap = new Map<string, string>();
  for (const node of KUNLUN_ADMIN_ORGS) {
    await upsertOrg(node, 'admin', adminMap);
  }
  console.log(`  ✓ 行政机构 ${KUNLUN_ADMIN_ORGS.length} 条已 upsert`);

  /* 党组织 47 条:1 root + 35 L2 + 11 L3 */
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
