import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 审核回执(派发人侧):
 *   decision=approve → 通过,派发对象转「已完成」done
 *   decision=return  → 退回重填,转「已退回」returned(note 必填,回到责任人填报页显示)
 */
export class ReviewSubmissionDto {
  @IsIn(['approve', 'return'])
  decision!: 'approve' | 'return';

  /** 退回原因(decision=return 必填);通过时可留空备注。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
