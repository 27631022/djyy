import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** 更新一个节目(标题 / 玩法配置 / 独立音效)。config 整份提交,服务端 validateConfig + normalizeGameSound 归一化。 */
export class UpdateGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
