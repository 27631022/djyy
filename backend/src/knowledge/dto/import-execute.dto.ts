import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ImportItemDto {
  /** zip 内相对路径(analyze 返回,原样回传) */
  @IsString()
  path!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  /** 领域分类路径(name 数组,最多两级);service 幂等建/找 */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(2)
  categoryPath!: string[];

  @IsString()
  typeCode!: string;

  @IsIn(['create', 'skip'])
  action!: 'create' | 'skip';
}

export class ImportExecuteDto {
  @IsString()
  importFileId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportItemDto)
  @ArrayMaxSize(1000)
  items!: ImportItemDto[];
}
