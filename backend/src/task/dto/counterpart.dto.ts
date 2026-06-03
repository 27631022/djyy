import { IsString, MinLength } from 'class-validator';

/** 任务详情「配置对口」:把某责任部门(handlerOrgId)的对口上级设为本任务派发部门。 */
export class ConfigureCounterpartDto {
  @IsString()
  @MinLength(1)
  handlerOrgId!: string;
}

/** 任务详情「设置/补派发部门」:给(尤其是历史)任务补上派发部门,对口才能匹配。 */
export class SetDispatchOrgDto {
  @IsString()
  @MinLength(1)
  dispatchOrgId!: string;
}
