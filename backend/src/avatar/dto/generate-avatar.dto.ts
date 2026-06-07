import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 生成头像:传上传照片的 fileId(走 storage 上传得到),可选自定义 prompt(覆盖默认) */
export class GenerateAvatarDto {
  @IsString()
  @MaxLength(64)
  photoFileId!: string;

  /** 自定义提示词(留空用默认「3D 仿真人 / 职场 / 红底」)。 */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;

  /** 目标用户姓名 —— 生成头像按「姓名+员工编号」归档到 File Station 可浏览的文件夹。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetName?: string;

  /** 目标用户员工编号 —— 同上,作归档文件夹。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeNumber?: string;
}
