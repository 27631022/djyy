import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as opentype from 'opentype.js';

/**
 * 中文 3D 文字 — 字体子集服务。
 *
 * 客户端 text_3d 组件用 Babylon `MeshBuilder.CreateText` 挤出立体字,它吃
 * typeface.js 格式的 fontData(three.js FontLoader 同款)。中文全量 typeface
 * JSON 会有几十 MB,因此按需子集:只把「本厅用到的字符」的 glyph 轮廓转出来。
 *
 * 转换:opentype.js 解析 TTF(TrueType 二次曲线,只产 M/L/Q/Z)→ typeface
 * 命令串。注意 typeface 的 q/b 是「终点在前、控制点在后」(three FontLoader
 * 的解析顺序,Babylon 同款移植),与 opentype 命令字段顺序相反。
 *
 * 字体(均 OFL 免费商用,随仓库分发,assets/fonts/):
 *   sans       NotoSansSC.ttf            思源黑体·常规
 *   sans-bold  NotoSansSC-Bold.otf       思源黑体·加粗
 *   serif      NotoSerifSC-Regular.otf   思源宋体·常规
 *   serif-bold NotoSerifSC-Bold.otf      思源宋体·加粗
 * OTF 为 CFF 三次曲线 → convertGlyph 的 'C'→'b' 分支处理(typeface 终点在前)。
 */

/** typeface.js 格式单字形 */
interface TypefaceGlyph {
  ha: number; // 水平步进(font units)
  x_min: number;
  x_max: number;
  o: string; // 轮廓命令串:m/l/q(+坐标),终点在前控制点在后
}

export interface TypefaceFontSubset {
  familyName: string;
  ascender: number;
  descender: number;
  underlinePosition: number;
  underlineThickness: number;
  boundingBox: { xMin: number; xMax: number; yMin: number; yMax: number };
  resolution: number; // = unitsPerEm,three/Babylon 用 size/resolution 缩放
  glyphs: Record<string, TypefaceGlyph>;
}

/** 可选字体(key = 前端 Text3dContent 的 font+weight 组合) */
export const FONT_KEYS = ['sans', 'sans-bold', 'serif', 'serif-bold'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

const FONT_DEFS: Record<FontKey, { file: string; family: string }> = {
  sans: { file: 'NotoSansSC.ttf', family: 'Noto Sans SC' },
  'sans-bold': { file: 'NotoSansSC-Bold.otf', family: 'Noto Sans SC Bold' },
  serif: { file: 'NotoSerifSC-Regular.otf', family: 'Noto Serif SC' },
  'serif-bold': { file: 'NotoSerifSC-Bold.otf', family: 'Noto Serif SC Bold' },
};

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const MAX_CHARS = 300; // 单次请求字符上限(一个厅的标语/LOGO 远用不到)

/** 任意入参 → 合法 FontKey(未知值回退 sans,旧数据/缺参兼容) */
export function normalizeFontKey(v: string | undefined): FontKey {
  return (FONT_KEYS as readonly string[]).includes(v ?? '') ? (v as FontKey) : 'sans';
}

@Injectable()
export class ExhibitionFontService {
  private readonly logger = new Logger(ExhibitionFontService.name);
  private readonly fonts = new Map<FontKey, opentype.Font>();
  /** fontKey → (字符 → 已转换 glyph;null = 字体里没有该字形) */
  private readonly glyphCaches = new Map<FontKey, Map<string, TypefaceGlyph | null>>();

  /** 懒加载解析字体文件(10~18MB,一次 1~2s,之后常驻内存) */
  private getFont(key: FontKey): opentype.Font {
    const cached = this.fonts.get(key);
    if (cached) return cached;
    const file = join(FONT_DIR, FONT_DEFS[key].file);
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const font = opentype.parse(ab);
    this.fonts.set(key, font);
    this.logger.log(`字体已加载:${file}(unitsPerEm=${font.unitsPerEm})`);
    return font;
  }

  /** 取字符集的 typeface 子集(客户端 CreateText 直接可用) */
  subset(chars: string, fontKey: FontKey = 'sans'): TypefaceFontSubset {
    const unique = [...new Set([...chars])].filter((c) => c.trim() !== '');
    if (unique.length === 0) throw new BadRequestException('chars 不能为空');
    if (unique.length > MAX_CHARS) {
      throw new BadRequestException(`单次最多 ${MAX_CHARS} 个字符`);
    }

    const font = this.getFont(fontKey);
    let cache = this.glyphCaches.get(fontKey);
    if (!cache) {
      cache = new Map();
      this.glyphCaches.set(fontKey, cache);
    }
    const glyphs: Record<string, TypefaceGlyph> = {};
    for (const ch of unique) {
      let g = cache.get(ch);
      if (g === undefined) {
        g = this.convertGlyph(font, ch);
        cache.set(ch, g);
      }
      if (g) glyphs[ch] = g;
    }

    const head = (font.tables as Record<string, Record<string, number>>).head;
    const post = (font.tables as Record<string, Record<string, number>>).post;
    return {
      familyName: FONT_DEFS[fontKey].family,
      ascender: font.ascender,
      descender: font.descender,
      underlinePosition: post?.underlinePosition ?? -100,
      underlineThickness: post?.underlineThickness ?? 50,
      boundingBox: {
        xMin: head?.xMin ?? 0,
        xMax: head?.xMax ?? font.unitsPerEm,
        yMin: head?.yMin ?? font.descender,
        yMax: head?.yMax ?? font.ascender,
      },
      resolution: font.unitsPerEm,
      glyphs,
    };
  }

  /** opentype 命令 → typeface 'o' 串(q/b 终点在前;z 不输出,m 即分隔轮廓) */
  private convertGlyph(font: opentype.Font, ch: string): TypefaceGlyph | null {
    const glyph = font.charToGlyph(ch);
    // index 0 = .notdef(字体没这个字)
    if (!glyph || glyph.index === 0) {
      this.logger.warn(`字体缺字形:「${ch}」`);
      return null;
    }
    const parts: string[] = [];
    const r = Math.round;
    for (const cmd of glyph.path.commands) {
      switch (cmd.type) {
        case 'M':
          parts.push('m', `${r(cmd.x)}`, `${r(cmd.y)}`);
          break;
        case 'L':
          parts.push('l', `${r(cmd.x)}`, `${r(cmd.y)}`);
          break;
        case 'Q':
          // typeface: q 终点x 终点y 控制x 控制y
          parts.push('q', `${r(cmd.x)}`, `${r(cmd.y)}`, `${r(cmd.x1)}`, `${r(cmd.y1)}`);
          break;
        case 'C':
          // TTF 二次曲线正常不会出现;万一出现按 typeface 'b'(终点在前)输出
          parts.push(
            'b',
            `${r(cmd.x)}`,
            `${r(cmd.y)}`,
            `${r(cmd.x1)}`,
            `${r(cmd.y1)}`,
            `${r(cmd.x2)}`,
            `${r(cmd.y2)}`,
          );
          break;
        case 'Z':
          break; // typeface 轮廓由下一个 m 自然分隔
      }
    }
    const metrics = glyph.getMetrics();
    return {
      ha: Math.round(glyph.advanceWidth ?? font.unitsPerEm),
      x_min: Math.round(metrics.xMin ?? 0),
      x_max: Math.round(metrics.xMax ?? 0),
      o: parts.join(' '),
    };
  }
}
