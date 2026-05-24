import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 编辑外部 API 配置(全字段可选,仅传需要更新的)
 *
 * apiKey 传空字符串 = 清空当前 key
 * apiKey 不传 = 保持原 key 不变
 */
export class UpdateExternalApiDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  rechargeUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** JSON 字符串,任意扩展配置 */
  @IsOptional()
  @IsString()
  meta?: string;
}

/**
 * 测试连接 DTO — 允许覆盖临时 key(便于编辑对话框里「测试当前编辑值」)
 */
export class TestExternalApiDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;
}

/**
 * 新增 provider(用户在系统里自己加平台时用)
 */
export class CreateExternalApiDto {
  @IsString()
  @MaxLength(64)
  provider!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  rechargeUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  meta?: string;
}
