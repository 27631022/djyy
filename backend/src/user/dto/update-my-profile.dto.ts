import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const trimIfString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * 个人设置:自助更新本人资料 —— 只开放 email/phone/avatarUrl 白名单,
 * 不收 name/active/username(姓名与账号状态由管理员维护,登录名不可改)。
 * email/phone:undefined = 不更新;null 或空字符串 = 清空(@IsOptional 会放行 null,service 需同样兜住)。
 * 先 @Transform trim 再校验 —— 让 "  a@b.com  " 这类输入的校验口径与落库值一致。
 */
export class UpdateMyProfileDto {
  @IsOptional()
  @Transform(trimIfString)
  @ValidateIf((o: UpdateMyProfileDto) => o.email !== '' && o.email !== null)
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(40)
  @Matches(/^[0-9+\-() ]*$/, { message: '电话格式不正确(仅限数字、+、-、空格、括号)' })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
