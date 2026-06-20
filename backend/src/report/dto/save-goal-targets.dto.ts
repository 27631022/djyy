import { IsArray, IsOptional } from 'class-validator';

/** 一个派发对象的逐单位目标值:{ goalKey: 数值 }。 */
export interface GoalTargetRow {
  targetId: string;
  values: Record<string, number>;
}

/** 批量保存逐单位目标值(targetMode=perUnit 的金额目标用);语义/过滤在 service。 */
export class SaveGoalTargetsDto {
  @IsOptional()
  @IsArray()
  rows?: GoalTargetRow[];
}
