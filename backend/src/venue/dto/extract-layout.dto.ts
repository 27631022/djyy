import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** AI 帮填:把一段会场描述解析成排式布局参数 */
export class ExtractLayoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;
}
