import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 审核一张发票:通过 / 退回(退回必须填原因)。 */
export class ReviewSubmissionDto {
  @IsIn(['approve', 'return'])
  decision!: 'approve' | 'return';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
