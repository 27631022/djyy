/**
 * 模板配置的归一化安全网。
 *
 * 后台提交的 config 一律从这里白名单重建 —— 不是「校验后放行」而是「照着默认值逐字段重建」,
 * 未知键直接丢弃。理由:这些值会流进 OOXML 属性和排版数学(charSpace/每页行数),
 * 一个 NaN 或负版心就能生成打不开的文件。
 */
import { BUILTIN_PRESET_MAP, DEFAULT_PRESET_KEY } from './presets';
import {
  ELEMENT_TYPES,
  FONT_ROLES,
  type Align,
  type DocFormatConfig,
  type ElementStyle,
  type ElementType,
  type FontRole,
} from './types';

const ALIGNS: readonly Align[] = ['left', 'center', 'right', 'justify'];

/** 字体名上限 —— 它会进 XML 属性 */
const MAX_FONT_NAME = 64;

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function int(v: unknown, def: number, min: number, max: number): number {
  return Math.round(num(v, def, min, max));
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

/** 字体名:剥掉控制字符与 XML 元字符(它会进 XML 属性)+ 限长。空则回落默认 */
function fontName(v: unknown, def: string): string {
  if (typeof v !== 'string') return def;
  // eslint-disable-next-line no-control-regex -- 就是要剥掉控制字符,不是笔误
  const s = v.replace(/[\u0000-\u001f<>"&]/gu, '').trim();
  return s ? s.slice(0, MAX_FONT_NAME) : def;
}

function align(v: unknown, def: Align): Align {
  return ALIGNS.includes(v as Align) ? (v as Align) : def;
}

function role(v: unknown, def: FontRole): FontRole {
  return FONT_ROLES.includes(v as FontRole) ? (v as FontRole) : def;
}

function elementStyle(v: unknown, def: ElementStyle): ElementStyle {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    font: role(o.font, def.font),
    sizePt: num(o.sizePt, def.sizePt, 5, 72),
    align: align(o.align, def.align),
    firstLineChars: int(o.firstLineChars, def.firstLineChars, 0, 1000),
    rightIndentChars: int(o.rightIndentChars, def.rightIndentChars ?? 0, 0, 1000) || undefined,
    bold: bool(o.bold, def.bold ?? false) || undefined,
    spaceBeforeLines: num(o.spaceBeforeLines, def.spaceBeforeLines ?? 0, 0, 10) || undefined,
    spaceAfterLines: num(o.spaceAfterLines, def.spaceAfterLines ?? 0, 0, 10) || undefined,
    keepNext: bool(o.keepNext, def.keepNext ?? false) || undefined,
    pageBreakBefore: bool(o.pageBreakBefore, def.pageBreakBefore ?? false) || undefined,
    emit: bool(o.emit, def.emit),
  };
}

/**
 * 白名单重建。base 缺省用默认预设。
 *
 * **不变量:normalize(preset) 必须语义等于 preset(不动点)**。破了就意味着「恢复默认」拿到的
 * 东西与 presets.ts 里写的对不上、模板存进 DB 再读出来会漂移。已知的破法:在 preset 里写
 * 「显式的零」(如 spaceBeforeLines: 0),会被下面的 `|| undefined` 收敛掉。
 * 有 `_diff.ts` 式的检查在 e2e 里跑,改 preset 或 clamp 区间后要复验。
 */
export function normalizeConfig(input: unknown, base?: DocFormatConfig): DocFormatConfig {
  const d = base ?? BUILTIN_PRESET_MAP[DEFAULT_PRESET_KEY].config;
  const o = (input ?? {}) as Record<string, unknown>;
  const p = (o.page ?? {}) as Record<string, unknown>;
  const g = (o.grid ?? {}) as Record<string, unknown>;
  const f = (o.fonts ?? {}) as Record<string, unknown>;
  const fb = (o.fontFallback ?? {}) as Record<string, unknown>;
  const el = (o.elements ?? {}) as Record<string, unknown>;
  const ar = (o.articleRule ?? {}) as Record<string, unknown>;
  const pn = (o.pageNumber ?? {}) as Record<string, unknown>;
  const ow = (o.orphanWarn ?? {}) as Record<string, unknown>;

  const page = {
    widthMm: num(p.widthMm, d.page.widthMm, 50, 1000),
    heightMm: num(p.heightMm, d.page.heightMm, 50, 1000),
    marginTopMm: num(p.marginTopMm, d.page.marginTopMm, 0, 200),
    marginBottomMm: num(p.marginBottomMm, d.page.marginBottomMm, 0, 200),
    marginLeftMm: num(p.marginLeftMm, d.page.marginLeftMm, 0, 200),
    marginRightMm: num(p.marginRightMm, d.page.marginRightMm, 0, 200),
  };
  // 版心必须为正 —— 边距吃光页面会生成打不开的文件
  if (page.marginLeftMm + page.marginRightMm >= page.widthMm - 10) {
    page.marginLeftMm = d.page.marginLeftMm;
    page.marginRightMm = d.page.marginRightMm;
  }
  if (page.marginTopMm + page.marginBottomMm >= page.heightMm - 10) {
    page.marginTopMm = d.page.marginTopMm;
    page.marginBottomMm = d.page.marginBottomMm;
  }

  const fonts = Object.fromEntries(
    FONT_ROLES.map((r) => [r, fontName(f[r], d.fonts[r])]),
  ) as Record<FontRole, string>;

  const fontFallback: Partial<Record<FontRole, string>> = {};
  for (const r of FONT_ROLES) {
    const v = fb[r];
    if (typeof v === 'string' && v.trim()) fontFallback[r] = fontName(v, '');
  }

  const elements = Object.fromEntries(
    ELEMENT_TYPES.map((t) => [t, elementStyle(el[t], d.elements[t])]),
  ) as Record<ElementType, ElementStyle>;

  return {
    page,
    grid: {
      charsPerLine: int(g.charsPerLine, d.grid.charsPerLine, 10, 60),
      lineSpacingPt: num(g.lineSpacingPt, d.grid.lineSpacingPt, 8, 100),
    },
    fonts,
    fontFallback,
    elements,
    articleRule: {
      splitNumber: bool(ar.splitNumber, d.articleRule.splitNumber),
      numberRole: role(ar.numberRole, d.articleRule.numberRole),
      inlineRole: role(ar.inlineRole, d.articleRule.inlineRole),
      standaloneRole: role(ar.standaloneRole, d.articleRule.standaloneRole),
    },
    pageNumber: {
      enabled: bool(pn.enabled, d.pageNumber.enabled),
      // 破折号只留 1~4 个字符,且不能是会破坏 XML 的东西
      dash: fontName(pn.dash, d.pageNumber.dash).slice(0, 4) || d.pageNumber.dash,
      font: role(pn.font, d.pageNumber.font),
      sizePt: num(pn.sizePt, d.pageNumber.sizePt, 5, 72),
      oddAlign: align(pn.oddAlign, d.pageNumber.oddAlign),
      evenAlign: align(pn.evenAlign, d.pageNumber.evenAlign),
      startAt: int(pn.startAt, d.pageNumber.startAt, 1, 9999),
      fromBottomMm: num(pn.fromBottomMm, d.pageNumber.fromBottomMm, 0, 100),
    },
    widowControl: bool(o.widowControl, d.widowControl),
    orphanWarn: {
      enabled: bool(ow.enabled, d.orphanWarn.enabled),
      maxTailCells: num(ow.maxTailCells, d.orphanWarn.maxTailCells, 0.5, 10),
      firstPageOffsetLines: int(ow.firstPageOffsetLines, d.orphanWarn.firstPageOffsetLines, 0, 21),
    },
  };
}
