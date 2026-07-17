import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 「按名称解析组织」的请求 —— 批量,一次 POST 拿回全部结果。
 *
 * 上限 200 与 LookupByEmpNoDto / LookupByNameDto 逐字对齐(发证场景的合理上限:
 * 单次表彰的集体数极少超过 200;两优一先实测 48 个党支部 + 7 个党委)。
 */
export class ResolvePartyOrgsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  names!: string[];
}

/** 名称命中组织的方式 —— 可信度递减,UI 据此决定是否标「待核对」 */
export type OrgMatchVia = 'exact' | 'strip-suffix' | 'contains';

export interface OrgNameMatch {
  orgId: string;
  name: string;
  /** 全称路径,如「昆仑物流 / 基层单位 / 云贵分公司」—— 前端直接落快照 */
  path: string;
  kind: 'admin' | 'party';
  via: OrgMatchVia;
}

/**
 * 一个名称 → 它命中的组织(可能多个)+ 这些组织的子树并集。
 *
 * ★ roots 必须是数组:组织名**允许重复**(唯一性靠 code 保证,见
 *   organization.service create() 注释)—— 612 个行政机构里「综合办公室」
 *   「安全部」这种同名部门大量存在。返回单个会静默取错组织。
 */
export interface OrgNameScope {
  roots: OrgNameMatch[];
  /** roots 各自子树的并集(含自身)—— 「姓名+单位」按子树匹配用 */
  orgIds: string[];
  /** roots.length > 1 → 名称本身多义,调用方须让用户点选 */
  ambiguous: boolean;
  /** 至少一个 root 是 exact 命中 —— 只有 exact 才配写进 deptOrgId */
  exact: boolean;
}

/**
 * 党组织 → 对口行政机构的解析结果。
 *
 * via 的可信度(真实库实测:党委 33/35 有 link = 94%,党支部仅 4/361 = 1%,
 * 所以 'ancestor' 必然是党支部的主路径):
 *  - 'link'     显式 PartyAdminLink —— 唯一可信档,可直接写 deptOrgId
 *  - 'name'     去后缀名匹配(西北分公司党委 → 西北分公司)—— 待核对
 *  - 'ancestor' 沿党组织树上溯到党委再解析 —— 得到的是「所属党委对应的单位」,
 *               不是支部自己的单位,**强制待核对**
 *  - 'none'     解析不出
 */
export interface ResolvedPartyOrg {
  partyOrgId: string;
  partyOrgName: string;
  partyOrgPath: string;
  adminOrgId: string | null;
  adminOrgName: string | null;
  /** 全称路径快照 —— 前端直接落 CollectiveRow.dept */
  adminOrgPath: string | null;
  via: 'link' | 'name' | 'ancestor' | 'none';
  /** via='ancestor' 时的中转党委名,UI 提示「经上级『甘肃分公司党委』推得」 */
  ancestorPartyOrgName?: string;
}
