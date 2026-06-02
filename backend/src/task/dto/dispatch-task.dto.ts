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
export interface TaskTargetInput {
  targetType: 'org' | 'user';
  targetOrgId?: string;
  targetUserId?: string;
}

export class DispatchTaskDto {
  /** 来源模板(可空 = 临时任务);仅作 provenance,字段以 fields 为准 */
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** 注意事项(可空) */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** 派发部门 org id(接收方对口路由按此匹配);前端默认传派发人主行政归属 */
  @IsOptional()
  @IsString()
  dispatchOrgId?: string;

  /** 截止时间 ISO 串(可空);service 里 new Date 解析 */
  @IsOptional()
  @IsString()
  dueAt?: string;

  /** 通知文件(前端先经 storageApi 上传拿 fileId) */
  @IsOptional()
  @IsString()
  noticeFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  noticeFileName?: string;

  /** TaskField[] —— 语义校验在 service */
  @IsArray()
  fields!: unknown[];

  /** TaskTargetInput[] —— 语义校验在 service */
  @IsArray()
  @ArrayNotEmpty()
  targets!: TaskTargetInput[];

  @IsOptional()
  @IsIn(['draft', 'open'])
  status?: 'draft' | 'open';
}
