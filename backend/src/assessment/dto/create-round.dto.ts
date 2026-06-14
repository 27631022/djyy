import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 发起考核(从考核表创建一个轮次)。name/year 可覆盖,缺省取考核表的。 */
export class CreateRoundDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
