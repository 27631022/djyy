import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class ReplacePermissionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  permissionIds!: string[];
}
