import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSchemeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  /** party(党建,对象=党组织) | admin(行政/业绩,对象=行政机构/员工) */
  @IsOptional()
  @IsIn(['party', 'admin'])
  track?: string;

  /** 党建:committee/branch/member;行政:unit/dept/employee */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetLevel?: string;
}
