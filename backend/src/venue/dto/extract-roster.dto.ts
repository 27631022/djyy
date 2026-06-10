import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** AI 识别:把一段粘贴的名单文本(列顺序任意)解析成结构化与会人 */
export class ExtractRosterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  text!: string;
}
