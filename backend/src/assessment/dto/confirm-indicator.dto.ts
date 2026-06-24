import { IsOptional, IsString } from 'class-validator';

/** 责任人确认某指标分数无误。note 预留(备注 / 申诉)。 */
export class ConfirmIndicatorDto {
  @IsOptional()
  @IsString()
  note?: string;
}
