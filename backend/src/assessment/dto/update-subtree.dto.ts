import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

/** 节点管理员维护本节点子树:nodeCode = 子树根节点 code;subtree = 单个 IndicatorNode(service 内规整+校验)。 */
export class UpdateSubtreeDto {
  @IsString()
  nodeCode!: string;

  @IsObject()
  subtree!: Record<string, unknown>;

  /** 确认「删除/更换取数计分工具 会连带删除这些指标的已录入」(同 UpdateSchemeDto.confirmDataLoss) */
  @IsOptional()
  @IsBoolean()
  confirmDataLoss?: boolean;
}
