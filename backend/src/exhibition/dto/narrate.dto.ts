import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 解说员配音请求:把解说词文本合成成音频 */
export class NarrateDto {
  /** 解说词文本 */
  @IsString()
  @MaxLength(2000)
  text!: string;

  /** 音色覆盖(空则用 provider 默认 ttsVoice) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  voice?: string;

  /** 所属展厅 id(决定音频落盘文件夹 narration/{hallId}) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  hallId?: string;
}
