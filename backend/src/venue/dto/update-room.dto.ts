import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoFileIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  facilities?: string[];

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
