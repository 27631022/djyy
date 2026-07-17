import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ELEMENT_TYPES, type ElementType } from '../types';

/** 一份公文的段落数上限 —— 挡住病态输入,正常公文两三百段封顶(实测办法体 130 段) */
export const MAX_ELEMENTS = 5000;

/** 人工确认页改过的段落类型 */
export class ElementOverrideDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsIn(ELEMENT_TYPES as unknown as string[])
  type!: ElementType;
}

export class RenderDto {
  /** analyze 时存进 storage 的原件 */
  @IsString()
  @IsNotEmpty()
  fileId!: string;

  @IsString()
  @IsNotEmpty()
  templateId!: string;

  /**
   * 只传「改过类型的段落」。正文文本一律由服务端从原件重新解析 ——
   * 客户端只能改类型,改不了字。公文一字不能错,文本不走客户端往返。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ELEMENTS)
  @ValidateNested({ each: true })
  @Type(() => ElementOverrideDto)
  overrides?: ElementOverrideDto[];
}

export class SaveTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  /** DocFormatConfig。结构由 normalizeConfig 白名单重建,不信客户端 */
  @IsOptional()
  config?: unknown;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
