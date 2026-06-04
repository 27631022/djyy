import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 指派承办人(部门负责人侧):把某「待接收」的派发对象直接指定给本部门某成员承办。
 * userId 必须是该承办部门的成员;指派后该成员即责任人(自助认领仍可用,二选一)。
 */
export class AssignTargetDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
