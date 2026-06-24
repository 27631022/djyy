import { IsBoolean, IsOptional } from 'class-validator';

/** 发起 / 重新发起分数确认。reset=true 把已确认项也重置为待确认。 */
export class ConfirmRequestDto {
  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
