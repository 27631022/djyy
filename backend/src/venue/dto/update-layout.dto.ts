import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateLayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  /** 画布序列化(VenueDesignerState);设计器保存时整体回写 */
  @IsOptional()
  @IsString()
  layoutJson?: string;

  /** data URL 缩略图 */
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  gridSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  seatCount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** 发布状态:draft 草稿 | published 已发布(排座可选) */
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;
}
