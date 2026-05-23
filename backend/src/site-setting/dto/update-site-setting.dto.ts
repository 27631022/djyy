import {
  IsArray,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class FriendLinkDto {
  @IsString()
  label!: string;

  @IsString()
  url!: string;
}

class BrandDto {
  @IsString()
  title!: string;

  @IsString()
  subtitle!: string;

  @IsString()
  logoUrl!: string;
}

class HeroDto {
  @IsString()
  mainSlogan!: string;

  @IsString()
  subSlogan!: string;

  @IsString()
  bannerLineEn!: string;
}

class FooterDto {
  @IsString()
  icp!: string;

  @IsString()
  copyright!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FriendLinkDto)
  friendLinks!: FriendLinkDto[];
}

class ThemeDto {
  @IsString()
  primary!: string;

  @IsString()
  accent!: string;
}

/**
 * PUT /site-settings 请求体
 *
 * 4 个 section 都必填 — 前端发的是完整对象,后端整体替换。
 * 这样避免"部分更新"导致字段丢失或合并冲突。
 */
export class UpdateSiteSettingDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BrandDto)
  brand!: BrandDto;

  @IsObject()
  @ValidateNested()
  @Type(() => HeroDto)
  hero!: HeroDto;

  @IsObject()
  @ValidateNested()
  @Type(() => FooterDto)
  footer!: FooterDto;

  @IsObject()
  @ValidateNested()
  @Type(() => ThemeDto)
  theme!: ThemeDto;
}
