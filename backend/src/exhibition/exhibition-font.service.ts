import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as opentype from 'opentype.js';
import * as ClipperLib from 'clipper-lib';

/**
 * 中文 3D 文字 — 字体子集服务。
 *
 * 客户端 text_3d 组件用 Babylon `MeshBuilder.CreateText` 挤出立体字,它吃
 * typeface.js 格式的 fontData(three.js FontLoader 同款)。中文全量 typeface
 * JSON 会有几十 MB,因此按需子集:只把「本厅用到的字符」的 glyph 轮廓转出来。
 *
 * 轮廓管线(2026-06-11 重做,修「加粗穿孔」):
 *   opentype.js 解析字形 → 曲线采样打平为折线 → clipper **nonzero union**
 *   → (细/中粗/特粗档)ClipperOffset 轮廓偏置合成字重 → 统一绕向输出 m/l。
 *
 * 为什么必须 union:Noto CJK 的笔画轮廓存在互相重叠(变量字体导出的静态
 * 实例不消重叠,字重越大重叠越多),且 OTF(CFF,实心 CCW)与 TTF(实心 CW)
 * 绕向相反 —— Babylon 按绕向+包含关系判实心/孔,重叠轮廓会被误判成孔,
 * 实测加粗(OTF)立体字出现穿孔。union 后轮廓互不相交、绕向统一(输出反转为
 * TTF 惯例:实心 CW / 孔 CCW,与一直渲染正确的常规黑体一致),彻底治掉。
 *
 * 字重 5 档:细体/中粗/特粗没有独立字体文件,由就近基准文件(常规/加粗)的
 * 轮廓 ±offset(font units,按 upm=1000 标定)合成,零新增字体体积。
 *
 * 字体文件(均 OFL 免费商用,随仓库分发,assets/fonts/):
 *   NotoSansSC.ttf 思源黑体·常规 / NotoSansSC-Bold.otf 思源黑体·加粗
 *   NotoSerifSC-Regular.otf 思源宋体·常规 / NotoSerifSC-Bold.otf 思源宋体·加粗
 */

/** typeface.js 格式单字形 */
interface TypefaceGlyph {
  ha: number; // 水平步进(font units)
  x_min: number;
  x_max: number;
  o: string; // 轮廓命令串(union 后只产 m/l 折线)
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

/**
 * 可选字体 key = 字族(sans/serif)×字重档。regular 档不带后缀(sans/serif),
 * 与旧数据「sans / sans-bold / serif / serif-bold」完全兼容。
 */
export const FONT_KEYS = [
  'sans-light',
  'sans',
  'sans-medium',
  'sans-bold',
  'sans-black',
  'serif-light',
  'serif',
  'serif-medium',
  'serif-bold',
  'serif-black',
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** offset:轮廓偏置量(font units @upm1000;0=用文件原始字重)。宋体细笔画多,偏置取小防笔画消失。 */
const FONT_DEFS: Record<FontKey, { file: string; family: string; offset: number }> = {
  'sans-light': { file: 'NotoSansSC.ttf', family: 'Noto Sans SC Light', offset: -10 },
  sans: { file: 'NotoSansSC.ttf', family: 'Noto Sans SC', offset: 0 },
  'sans-medium': { file: 'NotoSansSC.ttf', family: 'Noto Sans SC Medium', offset: 9 },
  'sans-bold': { file: 'NotoSansSC-Bold.otf', family: 'Noto Sans SC Bold', offset: 0 },
  'sans-black': { file: 'NotoSansSC-Bold.otf', family: 'Noto Sans SC Black', offset: 12 },
  'serif-light': { file: 'NotoSerifSC-Regular.otf', family: 'Noto Serif SC Light', offset: -6 },
  serif: { file: 'NotoSerifSC-Regular.otf', family: 'Noto Serif SC', offset: 0 },
  'serif-medium': { file: 'NotoSerifSC-Regular.otf', family: 'Noto Serif SC Medium', offset: 8 },
  'serif-bold': { file: 'NotoSerifSC-Bold.otf', family: 'Noto Serif SC Bold', offset: 0 },
  'serif-black': { file: 'NotoSerifSC-Bold.otf', family: 'Noto Serif SC Black', offset: 10 },
};

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const MAX_CHARS = 300; // 单次请求字符上限(一个厅的标语/LOGO 远用不到)
const QUAD_STEPS = 8; // 二次曲线采样段数(打平精度,挤出立体字足够平滑)
const CUBIC_STEPS = 10; // 三次曲线采样段数

/** 任意入参 → 合法 FontKey(未知值回退 sans,旧数据/缺参兼容) */
export function normalizeFontKey(v: string | undefined): FontKey {
  return (FONT_KEYS as readonly string[]).includes(v ?? '') ? (v as FontKey) : 'sans';
}

@Injectable()
export class ExhibitionFontService {
  private readonly logger = new Logger(ExhibitionFontService.name);
  /** 文件名 → 解析后的字体(sans/sans-light/sans-medium 共享同一份常规文件) */
  private readonly fontsByFile = new Map<string, opentype.Font>();
  /** fontKey(含字重档)→ (字符 → 已转换 glyph;null = 字体里没有该字形) */
  private readonly glyphCaches = new Map<FontKey, Map<string, TypefaceGlyph | null>>();

  /** 懒加载解析字体文件(10~18MB,一次 1~2s,之后常驻内存) */
  private getFont(key: FontKey): opentype.Font {
    const file = FONT_DEFS[key].file;
    const cached = this.fontsByFile.get(file);
    if (cached) return cached;
    const buf = readFileSync(join(FONT_DIR, file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const font = opentype.parse(ab);
    this.fontsByFile.set(file, font);
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
        g = this.convertGlyph(font, ch, FONT_DEFS[fontKey].offset);
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

  /**
   * 字形 → typeface 'o' 串:打平 → nonzero union → 字重偏置 → 统一绕向只发 m/l。
   * 失败兜底:任何一步出意外,返回 null(该字回退平面字,不炸整个子集)。
   */
  private convertGlyph(
    font: opentype.Font,
    ch: string,
    offsetUnits: number,
  ): TypefaceGlyph | null {
    const glyph = font.charToGlyph(ch);
    // index 0 = .notdef(字体没这个字)
    if (!glyph || glyph.index === 0) {
      this.logger.warn(`字体缺字形:「${ch}」`);
      return null;
    }
    const upm = font.unitsPerEm;

    // 1) 打平:曲线采样为折线,保留字体原生绕向(union 的 nonzero 规则依赖各轮廓方向一致)
    const rings: ClipperLib.Paths = [];
    let ring: ClipperLib.Path = [];
    let cx = 0;
    let cy = 0;
    const push = (x: number, y: number) => {
      const X = Math.round(x);
      const Y = Math.round(y);
      const last = ring[ring.length - 1];
      if (!last || last.X !== X || last.Y !== Y) ring.push({ X, Y });
    };
    const endRing = () => {
      if (ring.length >= 3) rings.push(ring);
      ring = [];
    };
    for (const cmd of glyph.path.commands) {
      switch (cmd.type) {
        case 'M':
          endRing();
          push(cmd.x, cmd.y);
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'L':
          push(cmd.x, cmd.y);
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'Q':
          for (let i = 1; i <= QUAD_STEPS; i++) {
            const t = i / QUAD_STEPS;
            const u = 1 - t;
            push(
              u * u * cx + 2 * u * t * cmd.x1 + t * t * cmd.x,
              u * u * cy + 2 * u * t * cmd.y1 + t * t * cmd.y,
            );
          }
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'C':
          for (let i = 1; i <= CUBIC_STEPS; i++) {
            const t = i / CUBIC_STEPS;
            const u = 1 - t;
            push(
              u * u * u * cx + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t * t * t * cmd.x,
              u * u * u * cy + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t * t * t * cmd.y,
            );
          }
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'Z':
          break; // 轮廓由下一个 M 自然分隔
      }
    }
    endRing();
    if (rings.length === 0) return null;

    try {
      // 2) nonzero union:吃掉笔画重叠 + 抹平 OTF/TTF 绕向差异(加粗穿孔根因)
      let polys = ClipperLib.Clipper.SimplifyPolygons(rings, ClipperLib.PolyFillType.pftNonZero);

      // 3) 字重偏置:细/中粗/特粗 = 基准轮廓向外(+)/向内(-)偏置,圆角连接防尖刺
      if (offsetUnits !== 0 && polys.length > 0) {
        const co = new ClipperLib.ClipperOffset(2, Math.max(1, upm / 400));
        co.AddPaths(polys, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        const out: ClipperLib.Paths = [];
        co.Execute(out, (offsetUnits * upm) / 1000);
        if (out.length > 0) polys = out; // 全部收缩没了(极端细)→ 保底用未偏置轮廓
      }

      // 4) 清近共线/重复点(减小载荷)
      polys = ClipperLib.Clipper.CleanPolygons(polys, Math.max(1, upm / 800));

      // 5) 输出:Clipper 外圈 CCW/孔 CW → 全部反转为 TTF 惯例(实心 CW/孔 CCW),
      //    与一直渲染正确的常规黑体同绕向,Babylon 实心/孔判定稳定
      const parts: string[] = [];
      let xMin = Infinity;
      let xMax = -Infinity;
      for (const poly of polys) {
        if (poly.length < 3 || Math.abs(ClipperLib.Clipper.Area(poly)) < 40) continue;
        const rev = [...poly].reverse();
        for (let i = 0; i < rev.length; i++) {
          const X = Math.round(rev[i].X);
          const Y = Math.round(rev[i].Y);
          parts.push(i === 0 ? 'm' : 'l', `${X}`, `${Y}`);
          if (X < xMin) xMin = X;
          if (X > xMax) xMax = X;
        }
      }
      if (parts.length === 0) return null;
      return {
        ha: Math.round(glyph.advanceWidth ?? upm),
        x_min: Number.isFinite(xMin) ? xMin : 0,
        x_max: Number.isFinite(xMax) ? xMax : Math.round(glyph.advanceWidth ?? upm),
        o: parts.join(' '),
      };
    } catch (e) {
      this.logger.warn(`字形轮廓处理失败:「${ch}」`, e as Error);
      return null;
    }
  }
}
