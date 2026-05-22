import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  /** code 仅允许小写字母数字下划线点,如 dept_manager / portal.viewer */
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z][a-z0-9_.]*$/, { message: 'code 仅允许小写字母数字 _ . ,且首位为字母' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
