import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

/**
 * 字典项批量重排序 DTO。
 *
 * 同一父项下的兄弟项按 orderedIds 顺序重写 sortOrder(0, 10, 20, ...)。
 * 跨父项移动不在此接口范围(需用 update + parentId 单独改)。
 *
 * 上限 500 是单字典项总数的合理上限,真实业务字典都远小于此。
 */
export class ReorderDictItemsDto {
  /**
   * 父项 id;null 或不传 = 根级(分类)排序;
   * 传 id = 该 id 下面的二级项排序。
   * 服务端会校验所有 orderedIds 都属于此 parentId,否则 400。
   */
  @IsOptional()
  @ValidateIf((o) => o.parentId !== null)
  @IsString()
  parentId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  orderedIds!: string[];
}
