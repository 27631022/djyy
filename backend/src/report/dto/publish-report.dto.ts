import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 单个派发对象:单位(org)或个人(user)。语义校验在 service。 */
export interface ReportTargetInput {
  targetType: 'org' | 'user';
  targetOrgId?: string;
  targetUserId?: string;
  /** 逐单位目标值 { goalKey: 数值 }(perUnit 金额目标;service 按 perUnit 键过滤后落 goalTargetsJson) */
  goalTargets?: Record<string, number>;
}

export class PublishReportDto {
  /** 来源模板(可空 = 临时);仅作 provenance,字段以 fields 为准 */
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** 填报要求(可空) */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  /** 绑定的清单批次(catalog_pick 字段用) */
  @IsOptional()
  @IsString()
  catalogTag?: string;

  /** 对口路由 scope:默认 'global',可传 templateCode 按报送类型分别配 */
  @IsOptional()
  @IsString()
  routingScope?: string;

  /** 派发部门 org id */
  @IsOptional()
  @IsString()
  dispatchOrgId?: string;

  /** 截止时间 ISO 串(可空) */
  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  noticeFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  noticeFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  periodLabel?: string;

  /** ReportField[] —— 语义校验在 service(normalizeFieldDefs) */
  @IsArray()
  fields!: unknown[];

  /** ReportGoal[] —— 目标定义(语义校验在 service.normalizeGoals;可空) */
  @IsOptional()
  @IsArray()
  goals?: unknown[];

  /** ReportTargetInput[] —— 语义校验在 service */
  @IsArray()
  @ArrayNotEmpty()
  targets!: ReportTargetInput[];

  @IsOptional()
  @IsIn(['draft', 'open'])
  status?: 'draft' | 'open';
}
