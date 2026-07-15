import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const GENDERS = ['male', 'female', 'neutral'] as const;

/** 入库:文件先经 storage 上传(ownerModule=user, folder=avatars/library)拿 fileId 再提交。 */
export class AddLibraryItemDto {
  @IsString()
  @MaxLength(64)
  fileId!: string;

  /** 显示名(缺省取上传文件名去扩展名)。 */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(GENDERS as unknown as string[])
  gender?: string;
}

export class UpdateLibraryItemDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(GENDERS as unknown as string[])
  gender?: string;
}
