import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 逗号分隔字符串 → 数组(去空项);已是数组则原样 */
const commaList = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListUsersQuery {
  @IsOptional()
  @IsString()
  search?: string;

  /** 行政机构 id 精确匹配(找该组织的成员) */
  @IsOptional()
  @IsString()
  adminOrgId?: string;

  /** 配合 adminOrgId:"true" = 该机构及其全部下级(子树在服务端展开,避免几百个 id 拼 URL 超请求头上限) */
  @IsOptional()
  @IsBooleanString()
  adminOrgSubtree?: string;

  /** 行政机构 id 列表(逗号分隔;任一命中即匹配)—— 给「派发对象·个人」按本单位子树过滤用 */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @IsString({ each: true })
  adminOrgIds?: string[];

  /** 行政职务关键词列表(逗号分隔;任一「包含」命中即匹配)。筛选面板已改用 inDept,保留供 API/旧检索模板 */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  positionKeywords?: string[];

  /** 所属机构是否是「部门」(Organization.isDept):"true"=挂在任一部门下 / "false"=有行政归属但不在任何部门 */
  @IsOptional()
  @IsBooleanString()
  inDept?: string;

  /** 政治面貌字典 code 列表(逗号分隔;任一命中即匹配,如 party_member,probationary_member)。
   *  MaxLength 对齐字典项 code 的上限(60),避免合法字典项被 DTO 拦成 400 */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  politicalStatuses?: string[];

  /** 角色 id 列表(逗号分隔;任一命中即匹配) */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleIds?: string[];

  /** 是否部门负责人(组织管理中被设为某行政机构 meta.ownerUserId 的人):"true"=是 / "false"=否 */
  @IsOptional()
  @IsBooleanString()
  deptOwner?: string;

  /** 党组织 id 精确匹配 */
  @IsOptional()
  @IsString()
  partyOrgId?: string;

  /** "true" / "false" 字符串,留空表示不过滤 */
  @IsOptional()
  @IsBooleanString()
  active?: string;

  /** 只列党员 */
  @IsOptional()
  @IsBooleanString()
  hasParty?: string;

  /** 只列「未分配任何行政机构」的用户("true" 生效) */
  @IsOptional()
  @IsBooleanString()
  noAdminOrg?: string;

  /** 只列「政治面貌=中共党员/预备党员 且 未加入任何党组织」的用户("true" 生效) */
  @IsOptional()
  @IsBooleanString()
  noPartyOrg?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => parseInt(value, 10))
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  skip?: number;

  @IsOptional()
  @IsIn(['createdAt', 'name', 'username'])
  sortBy?: 'createdAt' | 'name' | 'username';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
