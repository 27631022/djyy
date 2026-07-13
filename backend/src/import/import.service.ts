import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { OrganizationService } from '../organization';
import { UserService } from '../user';
import { RoleService } from '../role';
import { AuditService } from '../audit';

interface Actor {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// 与本地枚举同字面量 → 结构上可直接喂给 OrganizationService.create(dto)
type OrgKind = 'party' | 'admin';
type OrgType = 'committee' | 'general' | 'branch' | 'temp_branch' | 'group' | 'level1' | 'level2' | 'level3' | 'level4';

const KIND_MAP: Record<string, OrgKind> = {
  党组织: 'party', 党: 'party', 行政: 'admin', 行政机构: 'admin', 行政单位: 'admin',
};
const PARTY_TYPE_MAP: Record<string, OrgType> = {
  党委: 'committee', 党总支: 'general', 党支部: 'branch', 临时党支部: 'temp_branch', 党小组: 'group',
};
const ADMIN_TYPE_MAP: Record<string, OrgType> = {
  一级单位: 'level1', 二级单位: 'level2', 三级单位: 'level3', 四级单位: 'level4',
  一级企业: 'level1', 二级企业: 'level2', 三级企业: 'level3', 四级企业: 'level4',
};

/** 取单元格并转字符串去空白;兼容表头带/不带括号说明两种写法 */
function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function isYes(v: string): boolean {
  return ['是', 'y', 'yes', 'true', '1', '√'].includes(v.trim().toLowerCase());
}

@Injectable()
export class ImportService {
  constructor(
    private readonly orgs: OrganizationService,
    private readonly users: UserService,
    private readonly roles: RoleService,
    private readonly audit: AuditService,
  ) {}

  private parseFirstSheet(buffer: Buffer): Record<string, unknown>[] {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('无法解析文件,请使用下载的 Excel 模板(.xlsx)');
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Excel 里没有工作表');
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
  }

  /* ─── 组织机构导入 ─── */
  async importOrganizations(buffer: Buffer, actor: Actor): Promise<ImportResult> {
    const rows = this.parseFirstSheet(buffer);
    const result: ImportResult = { total: rows.length, created: 0, skipped: 0, errors: [] };

    const existing = await this.orgs.findAll({ includeInactive: true });
    const codeToId = new Map(existing.map((o) => [o.code, o.id]));

    interface Parsed {
      rowNo: number; code: string; name: string; fullName?: string;
      kind: OrgKind; type: OrgType; parentCode: string | null; isDept: boolean; isVirtual: boolean;
    }
    const parsed: Parsed[] = [];
    rows.forEach((r, i) => {
      const rowNo = i + 2; // 表头占第 1 行
      const code = cell(r, '组织编码');
      const name = cell(r, '组织名称');
      if (!code || !name) {
        result.errors.push({ row: rowNo, reason: '组织编码、组织名称必填' });
        return;
      }
      const kind = KIND_MAP[cell(r, '类型(党组织/行政)', '类型')];
      if (!kind) {
        result.errors.push({ row: rowNo, reason: '「类型」须为 党组织 或 行政' });
        return;
      }
      const typeCn = cell(r, '层级');
      const type = kind === 'party' ? PARTY_TYPE_MAP[typeCn] : ADMIN_TYPE_MAP[typeCn];
      if (!type) {
        result.errors.push({ row: rowNo, reason: `「层级」值「${typeCn}」不识别(党组织填 党委/党总支/党支部/党小组;行政填 一级~四级单位)` });
        return;
      }
      parsed.push({
        rowNo, code, name,
        fullName: cell(r, '组织全称') || undefined,
        kind, type,
        parentCode: cell(r, '上级编码') || null,
        isDept: isYes(cell(r, '是否部门(是/否)', '是否部门')),
        isVirtual: isYes(cell(r, '是否虚拟(是/否)', '是否虚拟')),
      });
    });

    // 已存在的 code 直接跳过(再导只新增,不改动已有树)
    let remaining = parsed.filter((p) => {
      if (codeToId.has(p.code)) { result.skipped++; return false; }
      return true;
    });

    // 拓扑建树:父在库中或已建 → 可建;否则留到下一轮。直到无法再推进
    let progressed = true;
    while (remaining.length && progressed) {
      progressed = false;
      const blocked: Parsed[] = [];
      for (const p of remaining) {
        const parentId = p.parentCode ? codeToId.get(p.parentCode) ?? null : null;
        if (p.parentCode && !parentId) { blocked.push(p); continue; }
        try {
          const org = await this.orgs.create({
            code: p.code, name: p.name, fullName: p.fullName,
            kind: p.kind, type: p.type, parentId, isDept: p.isDept, isVirtual: p.isVirtual,
          });
          codeToId.set(p.code, org.id);
          result.created++;
          progressed = true;
        } catch (e) {
          result.errors.push({ row: p.rowNo, reason: (e as Error).message });
        }
      }
      remaining = blocked;
    }
    remaining.forEach((p) =>
      result.errors.push({ row: p.rowNo, reason: `上级编码「${p.parentCode}」在库中和本表中都找不到` }),
    );

    await this.audit.log({
      ...actor, action: 'import.organizations',
      detail: { total: result.total, created: result.created, skipped: result.skipped, errors: result.errors.length },
    });
    return result;
  }

  /* ─── 用户导入(建号 + 组织归属 + 默认 member 角色)─── */
  async importUsers(buffer: Buffer, actor: Actor): Promise<ImportResult> {
    const rows = this.parseFirstSheet(buffer);
    const result: ImportResult = { total: rows.length, created: 0, skipped: 0, errors: [] };

    const memberRole = (await this.roles.list()).find((r) => r.code === 'member');
    if (!memberRole) throw new BadRequestException('系统缺少默认角色 member,请先执行 npm run db:seed');

    const orgList = await this.orgs.findAll({ includeInactive: true });
    const codeToOrg = new Map(orgList.map((o) => [o.code, o]));

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 2;
      const username = cell(r, '工号');
      const name = cell(r, '姓名');
      if (!username || !name) {
        result.errors.push({ row: rowNo, reason: '工号、姓名必填' });
        continue;
      }
      try {
        // 存在性:命中则复用(只补归属/角色),否则新建
        const lite = (await this.users.lookupByEmpNo({ empNos: [username] }))[username];
        let userId: string;
        if (lite) {
          userId = lite.id;
          result.skipped++;
        } else {
          const u = await this.users.create(
            { username, name, email: cell(r, '邮箱') || undefined, phone: cell(r, '手机') || undefined },
            actor,
          );
          userId = u.id;
          result.created++;
        }

        // 行政机构归属
        const adminCode = cell(r, '行政机构编码');
        if (adminCode) {
          const org = codeToOrg.get(adminCode);
          if (!org) result.errors.push({ row: rowNo, reason: `行政机构编码「${adminCode}」不存在` });
          else if (org.kind !== 'admin') result.errors.push({ row: rowNo, reason: `编码「${adminCode}」不是行政机构` });
          else {
            try {
              await this.users.addMembership(userId, { orgId: org.id, position: cell(r, '行政职务') || undefined, isPrimary: true }, actor);
            } catch (e) {
              // 只吞「已在该组织」(重复归属);权限/其它异常须回显成错误行,不静默(finding #7)
              if (!(e instanceof ConflictException)) {
                result.errors.push({ row: rowNo, reason: `行政归属失败:${(e as Error).message}` });
              }
            }
          }
        }

        // 党组织归属
        const partyCode = cell(r, '党组织编码');
        if (partyCode) {
          const org = codeToOrg.get(partyCode);
          if (!org) result.errors.push({ row: rowNo, reason: `党组织编码「${partyCode}」不存在` });
          else if (org.kind !== 'party') result.errors.push({ row: rowNo, reason: `编码「${partyCode}」不是党组织` });
          else {
            try {
              await this.users.addMembership(userId, { orgId: org.id, position: cell(r, '党内职务') || undefined, isPrimary: true }, actor);
            } catch (e) {
              if (!(e instanceof ConflictException)) {
                result.errors.push({ row: rowNo, reason: `党组织归属失败:${(e as Error).message}` });
              }
            }
          }
        }

        // 默认角色:仅当该用户当前无任何角色时,赋普通用户 member(scope=self,最小权限)
        const detail = await this.users.findOne(userId);
        if (detail.roles.length === 0) {
          await this.users.replaceRoles(userId, { roles: [{ roleId: memberRole.id, scope: 'self' }] }, actor);
        }
      } catch (e) {
        result.errors.push({ row: rowNo, reason: (e as Error).message });
      }
    }

    await this.audit.log({
      ...actor, action: 'import.users',
      detail: { total: result.total, created: result.created, skipped: result.skipped, errors: result.errors.length },
    });
    return result;
  }

  /* ─── 模板生成 ─── */
  buildOrgTemplate(): Buffer {
    const header = ['组织编码', '组织名称', '组织全称', '类型(党组织/行政)', '层级', '上级编码', '是否部门(是/否)', '是否虚拟(是/否)'];
    const rows = [
      ['KLWL', '昆仑物流', '昆仑物流有限公司', '行政', '一级单位', '', '否', '否'],
      ['KLWL-JG', '公司机关', '', '行政', '二级单位', 'KLWL', '否', '否'],
      ['KLWL-DD', '调度部', '昆仑物流调度部', '行政', '三级单位', 'KLWL-JG', '是', '否'],
      ['KLWL-DW', '昆仑物流党委', '中共昆仑物流有限公司委员会', '党组织', '党委', '', '否', '否'],
      ['KLWL-DW-ZH', '综合党支部', '', '党组织', '党支部', 'KLWL-DW', '否', '否'],
    ];
    return this.toXlsx(header, rows, '组织机构');
  }

  buildUserTemplate(): Buffer {
    const header = ['工号', '姓名', '手机', '邮箱', '行政机构编码', '行政职务', '党组织编码', '党内职务'];
    const rows = [['80545411', '朱海君', '13800000000', 'zhu@example.com', 'KLWL-DD', '部门经理', 'KLWL-DW-ZH', '支部书记']];
    return this.toXlsx(header, rows, '用户');
  }

  private toXlsx(header: string[], rows: string[][], sheetName: string): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = header.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
