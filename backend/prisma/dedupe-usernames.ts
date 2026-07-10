/**
 * 员工编号(username)去重 + 补零标准化 —— 一次性脚本(独立 tsx 入口)。
 *
 * 背景:党员.xlsx 的编号是**文本**(带前导零、8 位,如 00855844),员工.xls 的编号被 Excel 当**数字**
 * 存(丢了前导零,如 855844)。同一个人(如赵振学)因此被建成两个账号 —— 8 位的(党员:党组织归属+完整档案)
 * 和短位的(员工:行政归属+岗位)。
 *
 * 标准:员工编号应为 **8 位数字,前面补 0**。本脚本:
 *   Phase 1【去重】:凡「padStart(8,'0') 后相同」且**同名同身份证**的两条 → 合并保留 8 位那条(survivor):
 *       把短号那条(loser)的行政归属(含岗位)、角色搬到 survivor,customFields 取并集(survivor 优先、补齐缺失键),
 *       phone/email 缺的用 loser 补,然后删除 loser。survivor.username 已是 8 位标准码。
 *   Phase 2【补零】:其余纯数字短号(<8 位、无 8 位孪生)→ username 直接 padStart(8,'0')(冲突则跳过告警)。
 *
 * 安全:只处理**同名 + 身份证一致(或缺证)**的碰撞组,异名/证不同 → 跳过报告不合并。已核验这批重复用户
 *   无证书/任务/知识/晒场/审计等任何引用(仅 归属+角色+customFields),删除不丢业务数据。
 *
 * 用法(cwd = backend):
 *   npx tsx prisma/dedupe-usernames.ts            # dry-run
 *   npx tsx prisma/dedupe-usernames.ts --commit   # 写库
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');

/** 纯数字且 <8 位 → 前补 0 到 8 位;否则原样 */
function pad8(username: string): string {
  return /^\d+$/.test(username) && username.length < 8 ? username.padStart(8, '0') : username;
}
function parseCf(s: string | null): Record<string, string> {
  if (!s) return {};
  try {
    const o = JSON.parse(s);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}
function idCardOf(cf: Record<string, string>): string {
  return cf.id_card_no ?? '';
}

interface U {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  customFields: string | null;
  memberships: { orgId: string; isPrimary: boolean; position: string | null; joinedAt: Date; org: { kind: string } }[];
  roles: { roleId: string; scope: string }[];
}

async function main() {
  console.log('━━━━ 员工编号去重 + 补零标准化 ━━━━');
  console.log(`模式:${COMMIT ? '★ 写库(--commit)' : 'dry-run(只打印,不写库)'}\n`);

  const users: U[] = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      email: true,
      customFields: true,
      memberships: { select: { orgId: true, isPrimary: true, position: true, joinedAt: true, org: { select: { kind: true } } } },
      roles: { select: { roleId: true, scope: true } },
    },
  });
  console.log(`用户总数:${users.length}`);

  // ── 分组(按 pad8)──
  const byNorm = new Map<string, U[]>();
  for (const u of users) (byNorm.get(pad8(u.username)) ?? byNorm.set(pad8(u.username), []).get(pad8(u.username))!).push(u);
  const groups = [...byNorm.entries()].filter(([, a]) => a.length > 1);

  interface Merge {
    norm: string;
    survivor: U;
    losers: U[];
  }
  const merges: Merge[] = [];
  const skipped: string[] = [];
  for (const [norm, arr] of groups) {
    const names = new Set(arr.map((u) => u.name));
    const ids = new Set(arr.map((u) => idCardOf(parseCf(u.customFields))).filter(Boolean));
    if (names.size > 1) {
      skipped.push(`[${norm}] 异名不合并:${[...names].join(' / ')}`);
      continue;
    }
    if (ids.size > 1) {
      skipped.push(`[${norm}] 身份证不同不合并:${[...ids].join(' , ')}`);
      continue;
    }
    const survivor = arr.find((u) => u.username === norm);
    if (!survivor) {
      skipped.push(`[${norm}] 组内无 8 位标准码成员,需人工核对:${arr.map((u) => u.username).join(',')}`);
      continue;
    }
    merges.push({ norm, survivor, losers: arr.filter((u) => u.id !== survivor.id) });
  }

  // ── Phase 2 目标:纯数字短号、且不在任何碰撞组(即无 8 位孪生)──
  const loserIds = new Set(merges.flatMap((m) => m.losers.map((l) => l.id)));
  const survivorNorms = new Set(merges.map((m) => m.norm));
  const padTargets = users.filter(
    (u) => /^\d+$/.test(u.username) && u.username.length < 8 && !loserIds.has(u.id) && !survivorNorms.has(pad8(u.username)),
  );

  // ── 打印计划 ──
  console.log(`\n── 计划 ──`);
  console.log(`碰撞组:${groups.length},可合并 ${merges.length},跳过(异名/证不同/无标准码)${skipped.length}`);
  console.log(`将删除重复账号(短号):${merges.reduce((n, m) => n + m.losers.length, 0)}`);
  console.log(`将补零标准化的独立短号:${padTargets.length}`);
  console.log(`\n合并示例(前 8 组):`);
  for (const m of merges.slice(0, 8)) {
    const adminOrg = m.losers[0].memberships.find((x) => x.org.kind === 'admin');
    console.log(`  ${m.survivor.name}:保留 ${m.survivor.username} ← 并入 ${m.losers.map((l) => l.username).join(',')}(搬 行政归属${adminOrg ? `[岗位:${adminOrg.position ?? '无'}]` : ''}+角色)`);
  }
  if (padTargets.length) {
    console.log(`\n补零示例(前 8 个):`);
    for (const u of padTargets.slice(0, 8)) console.log(`  ${u.name}:${u.username} → ${pad8(u.username)}`);
  }
  if (skipped.length) {
    console.log(`\n⚠ 跳过(需人工核对):`);
    for (const sMsg of skipped) console.log('    · ' + sMsg);
  }

  if (!COMMIT) {
    console.log('\n(dry-run 结束,如无异常请加 --commit 写库)');
    return;
  }

  // ═══════════════ 写库 ═══════════════
  console.log('\n── 写库 ──');

  // Phase 1:合并
  let mergedCount = 0;
  let movedMem = 0;
  let movedRole = 0;
  for (const m of merges) {
    const sOrgIds = new Set(m.survivor.memberships.map((x) => x.orgId));
    const sRoleIds = new Set(m.survivor.roles.map((x) => x.roleId));
    let sCf = parseCf(m.survivor.customFields);
    const memToCreate: { userId: string; orgId: string; isPrimary: boolean; position: string | null; joinedAt: Date }[] = [];
    const roleToCreate: { userId: string; roleId: string; scope: string }[] = [];
    let fillPhone = m.survivor.phone;
    let fillEmail = m.survivor.email;
    for (const l of m.losers) {
      // customFields 并集:survivor 优先,补 survivor 缺的键
      sCf = { ...parseCf(l.customFields), ...sCf };
      if (!fillPhone && l.phone) fillPhone = l.phone;
      if (!fillEmail && l.email) fillEmail = l.email;
      for (const lm of l.memberships) {
        if (!sOrgIds.has(lm.orgId)) {
          memToCreate.push({ userId: m.survivor.id, orgId: lm.orgId, isPrimary: lm.isPrimary, position: lm.position, joinedAt: lm.joinedAt });
          sOrgIds.add(lm.orgId);
        }
      }
      for (const lr of l.roles) {
        if (!sRoleIds.has(lr.roleId)) {
          roleToCreate.push({ userId: m.survivor.id, roleId: lr.roleId, scope: lr.scope });
          sRoleIds.add(lr.roleId);
        }
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: m.survivor.id },
        data: {
          customFields: Object.keys(sCf).length ? JSON.stringify(sCf) : null,
          phone: fillPhone,
          email: fillEmail,
        },
      });
      if (memToCreate.length) await tx.userOrganization.createMany({ data: memToCreate, skipDuplicates: true });
      if (roleToCreate.length) await tx.userRole.createMany({ data: roleToCreate, skipDuplicates: true });
      await tx.user.deleteMany({ where: { id: { in: m.losers.map((l) => l.id) } } }); // 级联删 loser 的 归属/角色
    });
    mergedCount += m.losers.length;
    movedMem += memToCreate.length;
    movedRole += roleToCreate.length;
  }
  console.log(`✓ Phase 1:合并删除重复账号 ${mergedCount};搬移行政归属 ${movedMem}、角色 ${movedRole}`);

  // Phase 2:补零(删掉 loser 后再算一次,避开与被删账号冲突)
  let padded = 0;
  const padSkipped: string[] = [];
  const takenNow = new Set((await prisma.user.findMany({ select: { username: true } })).map((u) => u.username));
  for (const u of padTargets) {
    const target = pad8(u.username);
    if (takenNow.has(target)) {
      padSkipped.push(`${u.username}(${u.name})→${target} 已被占用,跳过`);
      continue;
    }
    await prisma.user.update({ where: { id: u.id }, data: { username: target } });
    takenNow.add(target);
    padded++;
  }
  console.log(`✓ Phase 2:补零标准化 ${padded}${padSkipped.length ? `,跳过 ${padSkipped.length}` : ''}`);
  for (const sMsg of padSkipped) console.log('    · ' + sMsg);

  await prisma.auditLog.create({
    data: {
      action: 'user.dedupe_usernames',
      actorName: '系统维护(编号去重补零)',
      detail: JSON.stringify({ groups: groups.length, merged: mergedCount, movedMem, movedRole, padded, skipped: skipped.length }),
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
