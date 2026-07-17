/**
 * 内置排版模板(代码注册表)。
 *
 * DB 里的 DocFormatTemplate 存用户模板 + 对内置模板的覆盖(builtinKey 非空即覆盖),
 * 「恢复默认」= 按 builtinKey 从这里重读。照 prompt 模块「注册表存默认 + DB 存覆盖」范式。
 *
 * 加一套内置模板 = 这里加一条 + BUILTIN_PRESETS 列表加一项(seed 会自动种)。
 */
import type { DocFormatConfig, ElementStyle, ElementType, FontRole } from './types';

/** 字号速查(磅):公文只用这几个 */
export const SIZE_PT = {
  小初: 36,
  一号: 26,
  二号: 22,
  小二: 18,
  三号: 16,
  四号: 14,
  小四: 12,
} as const;

/** 方正公文字库(WPS 捆绑的那套,名字与用户规则字面一致) */
const FZ = {
  小标宋: '方正小标宋简体',
  黑体: '方正黑体简体',
  楷体: '方正楷体简体',
  仿宋: '方正仿宋简体',
  宋体: '宋体',
} as const;

/**
 * 备选字体:目标字库缺失时渲染端回落到它。
 * 选 Windows 自带的中易系(simsun/simhei/simkai/simfang),任何 Windows 都有,
 * 不至于掉到 SimSun 一种字体全篇同款。
 */
const FALLBACK: Partial<Record<FontRole, string>> = {
  title: '方正小标宋_GBK',
  heading: 'SimHei',
  subheading: 'KaiTi',
  body: 'FangSong',
};

function style(s: Partial<ElementStyle> & Pick<ElementStyle, 'font' | 'sizePt'>): ElementStyle {
  return {
    align: 'justify',
    firstLineChars: 200,
    emit: true,
    ...s,
  };
}

/**
 * 元素样式表 —— 实测跨「请示/办法/表彰决定」三种文种 8/8 命中,不需要按文种分表。
 * 层次序数的字体映射出自 GB/T 9704-2012 §7.3.3(注:国标原文是「一般…」,推荐性默认值,
 * 所以做成可改的模板而不是硬编码)。
 */
function elements(): Record<ElementType, ElementStyle> {
  return {
    // 公文大标题:居中、不缩进(实测真实公文 jc=center 且完全没有 w:ind)。
    // 段后不空行(用户 2026-07-17 定案)—— 标题与下方的间距由版式本身给,不靠段后空行撑。
    title: style({
      font: 'title',
      sizePt: SIZE_PT.二号,
      align: 'center',
      firstLineChars: 0,
      keepNext: true,
    }),
    // 副标题:正题下方,楷体三号(比正题小一号),居中不缩进
    subtitle: style({
      font: 'subheading',
      sizePt: SIZE_PT.三号,
      align: 'center',
      firstLineChars: 0,
      keepNext: true,
    }),
    // 版头元素,「只排正文」定位下默认不输出
    docNumber: style({
      font: 'body',
      sizePt: SIZE_PT.三号,
      align: 'center',
      firstLineChars: 0,
      emit: false,
    }),
    // 主送机关:顶格,不缩进
    recipient: style({
      font: 'body',
      sizePt: SIZE_PT.三号,
      align: 'left',
      firstLineChars: 0,
    }),
    // 条例体的章标题:居中小标宋三号(实测 8/8)
    // 注:别在这里写 spaceBeforeLines: 0 这类「显式的零」—— normalizeConfig 会把 0 收敛成
    // undefined(两者行为相同,都是不空行),于是 normalize(preset) !== preset,不动点就破了,
    // 「恢复默认」拿到的东西与代码里写的对不上。要「不空行」直接不写这个键。
    chapter: style({
      font: 'title',
      sizePt: SIZE_PT.三号,
      align: 'center',
      firstLineChars: 0,
      keepNext: true,
    }),
    // 第X条:run 级切分,序号恒黑体(见 articleRule)
    article: style({ font: 'heading', sizePt: SIZE_PT.三号 }),
    level1: style({ font: 'heading', sizePt: SIZE_PT.三号 }),
    level2: style({ font: 'subheading', sizePt: SIZE_PT.三号 }),
    level3: style({ font: 'body', sizePt: SIZE_PT.三号 }),
    level4: style({ font: 'body', sizePt: SIZE_PT.三号 }),
    body: style({ font: 'body', sizePt: SIZE_PT.三号 }),
    attachmentNote: style({ font: 'body', sizePt: SIZE_PT.三号 }),
    // 落款/日期:国标右空二字/四字
    signature: style({
      font: 'body',
      sizePt: SIZE_PT.三号,
      align: 'right',
      firstLineChars: 0,
      rightIndentChars: 200,
      spaceBeforeLines: 1,
      keepNext: true,
    }),
    date: style({
      font: 'body',
      sizePt: SIZE_PT.三号,
      align: 'right',
      firstLineChars: 0,
      rightIndentChars: 400,
    }),
    // 国标:附件另面编排,左上角第一行顶格标「附件」,有序号时标注序号
    attachmentMark: style({
      font: 'body',
      sizePt: SIZE_PT.三号,
      align: 'left',
      firstLineChars: 0,
      pageBreakBefore: true,
    }),
    attachmentTitle: style({
      font: 'title',
      sizePt: SIZE_PT.三号,
      align: 'center',
      firstLineChars: 0,
      spaceAfterLines: 1,
      keepNext: true,
    }),
    skip: style({ font: 'body', sizePt: SIZE_PT.三号, emit: false }),
  };
}

function baseConfig(charsPerLine: number): DocFormatConfig {
  return {
    page: {
      widthMm: 210,
      heightMm: 297,
      // GB/T 9704-2012:天头 37±1mm、订口 28±1mm;下/右由版心 156×225mm 推导
      marginTopMm: 37,
      marginBottomMm: 35,
      marginLeftMm: 28,
      marginRightMm: 26,
    },
    grid: { charsPerLine, lineSpacingPt: 28 },
    fonts: {
      title: FZ.小标宋,
      heading: FZ.黑体,
      subheading: FZ.楷体,
      body: FZ.仿宋,
      pageNumber: FZ.宋体,
    },
    fontFallback: { ...FALLBACK },
    elements: elements(),
    articleRule: {
      splitNumber: true,
      numberRole: 'heading',
      inlineRole: 'body',
      standaloneRole: 'heading',
    },
    textRules: { curlyQuotes: true },
    markdown: { autoNumber: true },
    pageNumber: {
      enabled: true,
      dash: '—', // em dash。注:U+2014,不是 ASCII 的 -
      font: 'pageNumber',
      sizePt: SIZE_PT.四号,
      oddAlign: 'right',
      evenAlign: 'left',
      startAt: 1,
      // 版心下边缘在距页底 35mm 处,国标要求页码一字线上距它 7mm(= 距页底 28mm);
      // 减掉四号字自身行高约 6mm → 22mm
      fromBottomMm: 22,
    },
    widowControl: true,
    orphanWarn: { enabled: true, maxTailCells: 2, firstPageOffsetLines: 0 },
  };
}

export type BuiltinPreset = {
  key: string;
  name: string;
  description: string;
  config: DocFormatConfig;
};

export const BUILTIN_PRESETS: readonly BuiltinPreset[] = [
  {
    key: 'kunlun',
    name: '昆仑物流标准',
    description:
      '本单位现行公文行款:每行 26 字(版心加宽 +1.01 磅/字),其余同国标。实测自现行成文的字符步进 17.01 磅 = 442.2 ÷ 26。',
    config: baseConfig(26),
  },
  {
    key: 'gb9704',
    name: '国标默认(GB/T 9704-2012)',
    description:
      '《党政机关公文格式》推荐行款:版心 156×225mm、每面 22 行、每行 28 字、三号仿宋正文。',
    config: baseConfig(28),
  },
];

export const BUILTIN_PRESET_MAP: Record<string, BuiltinPreset> = Object.fromEntries(
  BUILTIN_PRESETS.map((p) => [p.key, p]),
);

/** 默认模板 key —— 新用户进来先用它 */
export const DEFAULT_PRESET_KEY = 'kunlun';
