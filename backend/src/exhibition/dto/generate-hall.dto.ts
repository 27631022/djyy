import { IsArray, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/** AI 生成展厅:文字描述 + 选项 +(可选)参考图,三者至少给一样 */
export class GenerateHallDto {
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString()
  imageFileId?: string;

  @IsOptional() @IsNumber()
  widthM?: number;

  @IsOptional() @IsNumber()
  depthM?: number;

  @IsOptional() @IsString() @MaxLength(32)
  preset?: string;

  @IsOptional() @IsArray()
  features?: string[];
}
