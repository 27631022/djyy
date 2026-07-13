import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** 新建自制游戏设计(config 可空=空白设计;整份提交,服务端 normalizeRouteRaceDesign 归一化)。 */
export class CreateDesignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

/** 更新自制游戏设计(名称/整份配置)。 */
export class UpdateDesignDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
