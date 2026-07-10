import { IsObject } from 'class-validator';

/** 更新活动通用设置(背景/音乐/分组)。服务端 normalizeEventConfig 归一化,DTO 只作松校验。 */
export class UpdateConfigDto {
  @IsObject()
  config!: Record<string, unknown>;
}
