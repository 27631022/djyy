import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  /**
   * V2:荣誉代码,如 "QDJL"(UI 文案叫「荣誉代码」),用于发证编号生成
   * V3+:必填 — 没有荣誉代码无法生成证书编号
   */
  @IsString()
  @MinLength(1, { message: '荣誉代码必填' })
  @MaxLength(32)
  honorCode!: string;

  /** V3:荣誉类型 — individual(个人)/ collective(集体)。必填 */
  @IsIn(['individual', 'collective'], { message: '荣誉类型必填' })
  honorType!: 'individual' | 'collective';

  /**
   * V3+:荣誉等级 — 字典 cert_honor_level 的 code,默认有
   * company/department/subsidiary 三个,管理员可在数据字典中扩展。
   * 这里只做字符串校验,不再 @IsIn,字典 code 由前端下拉控制。
   */
  @IsString()
  @MinLength(1, { message: '荣誉等级必填' })
  @MaxLength(64)
  honorLevel!: string;

  /** V3+:落款单位(发证机构),证书印章顶弧文字默认引用。必填 */
  @IsString()
  @MinLength(1, { message: '落款单位必填' })
  @MaxLength(128)
  issuingOrgName!: string;

  /** DesignerState 序列化的 JSON 字符串。前端 Canvas 设计器负责生成 + 解析。 */
  @IsString()
  designJson!: string;

  /** 缩略图 data URL,可空(新建时一般还没有) */
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(4000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(4000)
  height?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
