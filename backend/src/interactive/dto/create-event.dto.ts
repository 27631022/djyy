import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 活动里的一个游戏(节目单一项)。config 由 GameDef.validateConfig 再归一化,DTO 只作松校验。 */
export class CreateGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  gameType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

/** 新建一场活动:标题 + 节目单(至少一个游戏)。 */
export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateGameDto)
  games!: CreateGameDto[];

  /** 活动通用设置(背景/音乐/分组);服务端 normalizeEventConfig 再归一化,DTO 只作松校验 */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
