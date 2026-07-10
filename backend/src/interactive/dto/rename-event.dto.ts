import { IsString, MinLength, MaxLength } from 'class-validator';

/** 改活动名称(服务端再 trim + 校验非空/长度)。 */
export class RenameEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;
}
