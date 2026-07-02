import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSchemeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsIn(['party', 'admin'])
  track?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetLevel?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: string;

  /** 指标树 IndicatorNode[](内层结构由 service 的 normalizeIndicatorTree 校验) */
  @IsOptional()
  @IsArray()
  indicators?: unknown[];

  /** 考核对象快照 [{orgId,name}](一次性从组织树读出后冻结,与组织解耦) */
  @IsOptional()
  @IsArray()
  targets?: unknown[];

  /** {thresholds:[{grade,min}], vetoGrade} */
  @IsOptional()
  @IsObject()
  gradeRules?: Record<string, unknown>;

  /** {baseFullScore:100, bonusCap, deductionCap, vetoZero} */
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  /** 确认「删除/更换取数计分工具 会连带删除这些指标的已录入」:
   *  首次保存若命中带录入的结构性改动会 409 返回明细;前端弹确认后带 true 重试。 */
  @IsOptional()
  @IsBoolean()
  confirmDataLoss?: boolean;
}
