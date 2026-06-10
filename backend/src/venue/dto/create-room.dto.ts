import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 现场照片 storage fileId 列表 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoFileIds?: string[];

  /** 硬件设施标签(视频会议/音响/投屏…) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  facilities?: string[];

  /** 归属单位 org id(松引用) */
  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
