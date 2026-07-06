import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTypeDto {
  /** 类型代码 — 小写字母数字下划线,建后不可改(文章松引用它) */
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'code 仅允许小写字母数字下划线,且首位为字母' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;

  /** 该类型文章提交是否需管理员审核 */
  @IsOptional()
  @IsBoolean()
  requireReview?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsBoolean()
  requireReview?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
