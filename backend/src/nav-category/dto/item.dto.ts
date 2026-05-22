import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateNavItemDto {
  @IsString() @MinLength(1)
  icon!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  label!: string;

  @IsString()
  color!: string;

  @IsOptional() @IsString() @MaxLength(500)
  url?: string;

  @IsOptional() @IsString() @MaxLength(200)
  desc?: string;

  @IsOptional() @IsBoolean()
  common?: boolean;

  @IsOptional() @IsInt()
  likes?: number;

  @IsOptional() @IsInt()
  views?: number;

  @IsOptional() @IsInt()
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateNavItemDto {
  @IsOptional() @IsString()
  icon?: string;

  @IsOptional() @IsString() @MaxLength(64)
  label?: string;

  @IsOptional() @IsString()
  color?: string;

  @IsOptional() @IsString() @MaxLength(500)
  url?: string;

  @IsOptional() @IsString() @MaxLength(200)
  desc?: string;

  @IsOptional() @IsBoolean()
  common?: boolean;

  @IsOptional() @IsInt()
  likes?: number;

  @IsOptional() @IsInt()
  views?: number;

  @IsOptional() @IsInt()
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
