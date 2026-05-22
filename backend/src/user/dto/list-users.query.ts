import { Transform } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListUsersQuery {
  @IsOptional()
  @IsString()
  search?: string;

  /** 行政机构 id 精确匹配(找该组织的成员) */
  @IsOptional()
  @IsString()
  adminOrgId?: string;

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
