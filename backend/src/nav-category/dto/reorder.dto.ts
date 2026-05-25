import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
} from 'class-validator';

/**
 * 首页导航分类(一级)重排序 DTO。
 * 全量传入 orderedIds — 服务端校验"是否全部属于 NavCategory 集合 + 无重复",
 * 然后按数组顺序重写 sortOrder = idx * 10(给手插值留间隙)。
 *
 * 上限 200 是合理上限;真实业务很少超过 20 个分类。
 */
export class ReorderNavCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  orderedIds!: string[];
}

/**
 * 同一分类下的 NavItem 重排序 DTO。
 * 校验:全部 id 都属于 path 里的 :categoryId,否则 400(防止跨分类排序)。
 */
export class ReorderNavItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  orderedIds!: string[];
}
