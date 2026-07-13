import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf,
} from 'class-validator';

const trimIfString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * 通讯录管理:改联系方式 / 隐藏显示(全 optional;email/phone 传空串或 null = 清空)。
 * email/phone 校验口径与「个人设置」UpdateMyProfileDto 一致 —— 空串/null 放行(=清空),
 * 非空才校验格式(否则会把非法邮箱写进全库共享的唯一列,破坏门户 mailto 且占位唯一约束)。
 */
export class UpdateDirectoryMemberDto {
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(40)
  @Matches(/^[0-9+\-() ]*$/, { message: '电话格式不正确(仅限数字、+、-、空格、括号)' })
  phone?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @ValidateIf((o: UpdateDirectoryMemberDto) => o.email !== '' && o.email !== null)
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(120)
  email?: string | null;
}

/** 通讯录管理:按单位拖拽排序(userIds = 期望顺序) */
export class ReorderDirectoryDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  userIds!: string[];
}
