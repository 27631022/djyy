import { IsBoolean, IsObject, IsOptional } from 'class-validator';

/** 填报保存:formData = { [fieldCode]: value };submit=true 则校验必填并提交。 */
export class SaveFillDto {
  @IsObject()
  formData!: Record<string, unknown>;

  /** true = 提交(校验必填 + 转已提交);false/缺省 = 存草稿 */
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
