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

class TopNavLinkDto {
  @IsString()
  label!: string;

  @IsString()
  url!: string;
}

class TopNavDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopNavLinkDto)
  items!: TopNavLinkDto[];
}

class ThemeDto {
  @IsString()
  primary!: string;

  @IsString()
  accent!: string;
}

class PortalDto {
  /** 首页考核排行榜显示的考核表 id;空串 = 自动取最新轮次 */
  @IsString()
  assessmentSchemeId!: string;
}

/**
 * PUT /site-settings 请求体
 *
 * 各 section 都必填 — 前端发的是完整对象(从 GET 初始化),后端整体替换。
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
  @Type(() => TopNavDto)
  topNav!: TopNavDto;

  @IsObject()
  @ValidateNested()
  @Type(() => ThemeDto)
  theme!: ThemeDto;

  @IsObject()
  @ValidateNested()
  @Type(() => PortalDto)
  portal!: PortalDto;
}
