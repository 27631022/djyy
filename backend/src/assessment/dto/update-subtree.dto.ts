import { IsObject, IsString } from 'class-validator';

/** 节点管理员维护本节点子树:nodeCode = 子树根节点 code;subtree = 单个 IndicatorNode(service 内规整+校验)。 */
export class UpdateSubtreeDto {
  @IsString()
  nodeCode!: string;

  @IsObject()
  subtree!: Record<string, unknown>;
}
