import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { OrgNameMatch } from '../../organization';
import type { UserByEmpNoLite } from './lookup-by-empno.dto';

/**
 * 「姓名 + 单位 → 员工编号」的一条待匹配项。
 *
 * orgName = 表彰文件里写的单位前缀原文(如「云贵分公司」),**只用来缩小候选范围**,
 * 不用来决定身份 —— 它是公文原文/口语称谓,不是权威归属。
 */
export class MatchNameOrgItem {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  orgName?: string;
}

/**
 * 批量「姓名(+单位)」匹配。
 *
 * 上限 200 与 LookupByEmpNoDto / LookupByNameDto 逐字对齐;超出由前端分批
 * (两优一先的「优秀共产党员」实际有 130 人,单荣誉超 200 人极少)。
 */
export class MatchByNameOrgDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MatchNameOrgItem)
  items!: MatchNameOrgItem[];
}

/**
 * 匹配结果状态:
 *  - 'unique'         唯一命中 → 可回填工号/单位(仍标「待核对」,见 UI)
 *  - 'ambiguous'      同名多人 → **只回候选,由人工点选**,服务端绝不 tie-break
 *  - 'none'           库里没这个人
 *  - 'org-unresolved' 单位名解析不出组织 → 候选退化为全部同名在职用户(给用户点选的机会)
 */
export type MatchStatus = 'unique' | 'ambiguous' | 'none' | 'org-unresolved';

export interface MatchByNameOrgResult {
  name: string;
  orgName?: string;
  /** 单位名命中的组织(不回 orgIds:子树可能几百个 id,前端用不上还撑大响应) */
  orgScope: { roots: OrgNameMatch[]; ambiguous: boolean; exact: boolean } | null;
  /** 候选人 —— 复用 lookup 的既有形状,前端 buildOrgPath 直接可用 */
  candidates: UserByEmpNoLite[];
  /** 候选被 MATCH_CANDIDATE_MAX 截断 → UI 须引导「补充单位 / 直接填工号」,不能让用户在残缺列表里瞎选 */
  truncated: boolean;
  status: MatchStatus;
}
