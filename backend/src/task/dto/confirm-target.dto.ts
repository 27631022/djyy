import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 平级确认决定(部门负责人侧),针对某个「待确认」的跨机关部门派发对象:
 *   decision=approve → 同意(我所负责的一方通过;双方都通过才下发)
 *   decision=reject  → 驳回(note 必填;该派发对象作废,不影响同任务其他对象)
 */
export class ConfirmTargetDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  /** 驳回原因(decision=reject 必填);同意时可留空。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
