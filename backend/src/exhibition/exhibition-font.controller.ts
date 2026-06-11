import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ExhibitionFontService, normalizeFontKey } from './exhibition-font.service';

/**
 * 公开字体子集口(免登录)—— 3D 客户端 text_3d 组件取 typeface 格式字形。
 *   GET /public/exhibition/font?chars=企业文化展厅&font=serif-bold
 * font 可选:sans(默认)/ sans-bold / serif / serif-bold;未知值回退 sans。
 * 公开理由同素材口:展厅「开网址即进」,立体字是场景的一部分。
 */
@Controller('public/exhibition')
export class ExhibitionFontController {
  constructor(private readonly fonts: ExhibitionFontService) {}

  @Get('font')
  font(@Query('chars') chars?: string, @Query('font') font?: string) {
    if (!chars) throw new BadRequestException('chars 参数必填');
    return this.fonts.subset(chars, normalizeFontKey(font));
  }
}
