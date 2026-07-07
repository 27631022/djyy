import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/** 指派文章维护人员:传全量 userId 列表(覆盖式),service 解析姓名快照。 */
export class AssignMaintainersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  userIds!: string[];
}
