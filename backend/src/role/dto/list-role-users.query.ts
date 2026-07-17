import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** GET /roles/:id/users 分页查询 —— member 角色 2 万+成员,全量返回会卡死页面 */
export class ListRoleUsersQuery {
  /** 姓名 / 员工编号 模糊搜索(ILIKE) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

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
}
