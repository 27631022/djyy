import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 生成考核结果快照(季度/截止日定格)。label 用户命名,如「1季度结果」。 */
export class CreateSnapshotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
