import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

/** 存为讲解员形象包:名称 + 一套 HallGuide 配置(只需 fileId / 参数,service 会剥 url) */
export class CreateGuidePresetDto {
  @IsString() @MinLength(1) @MaxLength(64)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;
}

/** 形象包改名 */
export class RenameGuidePresetDto {
  @IsString() @MinLength(1) @MaxLength(64)
  name!: string;
}
