import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateNavCategoryDto {
  @IsString() @MinLength(1) @MaxLength(64)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  label!: string;

  @IsString()
  color!: string;

  @IsString()
  bgLight!: string;

  @IsString() @MinLength(1)
  icon!: string;

  @IsOptional() @IsInt()
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateNavCategoryDto {
  @IsOptional() @IsString() @MaxLength(64)
  label?: string;

  @IsOptional() @IsString()
  color?: string;

  @IsOptional() @IsString()
  bgLight?: string;

  @IsOptional() @IsString()
  icon?: string;

  @IsOptional() @IsInt()
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
