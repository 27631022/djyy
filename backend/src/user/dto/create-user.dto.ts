import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'username 仅允许字母数字与 _ . -' })
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
