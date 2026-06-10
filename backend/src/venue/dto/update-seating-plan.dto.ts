import {
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateSeatingPlanDto {
  /** 更换绑定的会场图;service 检测到 layout 变化会清空分区映射 + 排座结果并回到草稿 */
  @IsOptional()
  @IsString()
  layoutId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsIn(['draft', 'computed', 'finalized'])
  status?: string;

  /** 编辑后的名单(Attendee[]);service 用 normalizeRoster 规整后存 rosterJson */
  @IsOptional()
  @IsArray()
  roster?: unknown[];

  /** 组 → 区(zone) 映射 {组名: zoneId};存进 rulesJson */
  @IsOptional()
  @IsObject()
  groupZoneMap?: Record<string, string>;

  /** 方案专属区域(ZoneElement[]);存进 rulesJson.zones,不污染共享座次图 */
  @IsOptional()
  @IsArray()
  zones?: unknown[];

  /** 预留座位 id 列表(记者站位/设备位/过道留空);存进 rulesJson.reservedSeatIds,自动排座跳过、方案专属不污染共享图 */
  @IsOptional()
  @IsArray()
  reservedSeatIds?: string[];

  /** 会议信息 {startAt?,endAt?};存进 rulesJson.meeting */
  @IsOptional()
  @IsObject()
  meeting?: Record<string, unknown>;

  /** 中心参照点 {x,y}=手动指定,null=恢复自动;存进 rulesJson.anchor */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  anchor?: { x: number; y: number } | null;
}
