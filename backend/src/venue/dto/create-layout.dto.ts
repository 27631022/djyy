import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLayoutDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** 可选初始画布(VenueDesignerState 的 JSON);不传则 service 生成空画布 */
  @IsOptional()
  @IsString()
  layoutJson?: string;

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
}
