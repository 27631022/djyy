import { IsNotEmpty, IsString } from 'class-validator';

/** 指派承办人:把某「待接收」对象指定给本部门成员承办。 */
export class AssignReportDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
