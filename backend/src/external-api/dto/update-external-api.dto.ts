import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 编辑外部 API 配置(全字段可选,仅传需要更新的)
 *
 * apiKey 传空字符串 = 清空当前 key
 * apiKey 不传 = 保持原 key 不变
 */
export class UpdateExternalApiDto {
  /** 'cloud'(云平台)| 'internal'(内网自建) */
  @IsOptional()
  @IsIn(['cloud', 'internal'])
  kind?: 'cloud' | 'internal';

  /** 图标引用 lucide:X / brand:X / asset:<id>;'' 清空回默认品牌头像 */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  iconRef?: string;

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
  @MaxLength(64)
  visionModel?: string;

  /** 图像生成/图生图模型(SeedEdit 等,出图)。空 = 该 provider 不支持生图 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  imageModel?: string;

  /** 3D 生成模型(Seed3D 等,异步出 .glb)。空 = 不支持 3D 生成 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  model3d?: string;

  /** 语音合成(TTS)模型。空 = 不支持配音 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ttsModel?: string;

  /** TTS 音色标识(provider 各自的音色名)。空 = 用 provider 默认 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ttsVoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  rechargeUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  capabilities?: string;

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

  /** 'cloud'(云平台,默认)| 'internal'(内网自建,可无 key) */
  @IsOptional()
  @IsIn(['cloud', 'internal'])
  kind?: 'cloud' | 'internal';

  /** 图标引用 lucide:X / brand:X / asset:<id> */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  iconRef?: string;

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
  @MaxLength(64)
  visionModel?: string;

  /** 图像生成/图生图模型(SeedEdit 等,出图)。空 = 该 provider 不支持生图 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  imageModel?: string;

  /** 3D 生成模型(Seed3D 等,异步出 .glb)。空 = 不支持 3D 生成 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  model3d?: string;

  /** 语音合成(TTS)模型。空 = 不支持配音 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ttsModel?: string;

  /** TTS 音色标识(provider 各自的音色名)。空 = 用 provider 默认 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ttsVoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  rechargeUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  capabilities?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  meta?: string;
}

/**
 * 设置某消费功能(应用×功能)的模型绑定。
 * provider 传具体值 = 绑定到该 provider;传空串 / 不传 = 解绑(回退按优先级自动)。
 */
export class SetAiRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;
}
