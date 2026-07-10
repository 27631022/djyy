import { IsString, MaxLength, MinLength } from 'class-validator';

/** 修改密码(统一登录/Casdoor;旧密码由 IdP 校验,平台本地不存密码)。 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: '请输入原密码' })
  @MaxLength(200)
  oldPassword!: string;

  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(200)
  newPassword!: string;
}
