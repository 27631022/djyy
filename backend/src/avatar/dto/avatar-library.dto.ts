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

  /** 头像编辑器产物的部件配置(JSON 串;带它则 source=studio,可回编辑器再编辑)。 */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  configJson?: string;
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

/** 提升:把员工私有头像(avatars/{工号-姓名} 下的文件)复制进公共库。 */
export class PromoteFromFileDto {
  @IsString()
  @MaxLength(64)
  sourceFileId!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(GENDERS as unknown as string[])
  gender?: string;
}
