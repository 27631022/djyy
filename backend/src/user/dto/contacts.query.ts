import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBooleanString,
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

/**
 * 通讯录检索参数(GET /users/contacts)。
 * 登录即可、不做数据范围收敛(内部公司通讯录:全员可查同事联系方式,用户决策)。
 * 与 ListUsersQuery(管理向、按范围收敛、带角色/部门负责人等管理维度)刻意分开。
 */
export class ContactsQuery {
  /** 姓名 / 员工编号 / 电话 / 邮箱 / 所属机构名(任一包含,大小写不敏感) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** 行政机构 id 精确匹配(按部门浏览时用) */
  @IsOptional()
  @IsString()
  adminOrgId?: string;

  /** 配合 adminOrgId:"true" = 该机构及其全部下级(子树在服务端展开,避免几百个 id 拼 URL 超请求头上限) */
  @IsOptional()
  @IsBooleanString()
  adminOrgSubtree?: string;

  /** 党组织 id 精确匹配 */
  @IsOptional()
  @IsString()
  partyOrgId?: string;

  /** 只列党员(挂了党组织的人) */
  @IsOptional()
  @IsBooleanString()
  hasParty?: string;

  /** 所属机构是否是「部门」(Organization.isDept):"true"=挂在任一部门下 / "false"=有行政归属但不在任何部门 */
  @IsOptional()
  @IsBooleanString()
  inDept?: string;

  /** 政治面貌字典 code 列表(逗号分隔;任一命中即匹配)。MaxLength 对齐字典项 code 上限 */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  politicalStatuses?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  skip?: number;
}
