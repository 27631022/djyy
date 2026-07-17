/**
 * 公文网格模型:算断行、分页、孤字。
 *
 * 为什么能纯数学算:公文是固定网格(每行 N 字 × 每页 M 行),不是自由流排版。
 *
 * 职责被**刻意压到最小**,只干一件渲染端干不了的事 —— 孤字告警:
 * - 孤行 / 寡行 / 标题孤立 → 输出时打开 widowControl + 给标题加 keepNext,Word/WPS 自己解决。
 *   我们不模拟,模拟了也不如它准(最终权威是用户 PC 上的 Word)。
 * - 孤字(末行只剩一两个字) → 渲染端不会自动修(它只能整行下移,不能减字),只能我们算。
 *
 * ⚠ 精度上限是原理性的,不是调参能消除的:Word 的真实断行涉及标点压缩与中西文自动间距,
 *   是亚磅级临界判定。实测本模型断行准确率 90%(30 个断行决策错 3 个),且**漏报过样本里
 *   唯一一处真孤字**。所以结论只能是「疑似」,**绝不能对用户说「已检测,无孤字」**。
 *   实测教训:试过加点值模型 + 中西文自动间距想做「更精确」,准确率反而掉到 76.7% ——
 *   朴素模型(汉字 1 格 / 半角 0.5 格 / 行首禁则悬挂)已是扫描最优,别再「优化」。
 */
import type { DocElement, DocFormatConfig, DocRun, ElementType, FontRole, PageMetrics } from './types';

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;
/** OOXML 的 twip = 1/20 磅 */
export const TWIPS_PER_PT = 20;

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}
export function mmToTwips(mm: number): number {
  return Math.round(mmToPt(mm) * TWIPS_PER_PT);
}

/** 由模板参数推出版面几何。每页行数是算出来的,不是配的 */
export function metricsOf(cfg: DocFormatConfig): PageMetrics {
  const { page, grid } = cfg;
  const textWidthPt = mmToPt(page.widthMm - page.marginLeftMm - page.marginRightMm);
  const textHeightPt = mmToPt(page.heightMm - page.marginTopMm - page.marginBottomMm);
  return {
    textWidthPt,
    textHeightPt,
    charPitchPt: textWidthPt / grid.charsPerLine,
    linesPerPage: Math.floor(textHeightPt / grid.lineSpacingPt),
  };
}

/** 行首禁则:这些字符不能出现在行首,溢出时挂在上一行行尾 */
const NO_LINE_START = new Set(
  '，。、；：？！）〉》」』】〕”’…—～·%‰℃!),.:;?]}｝、',
);

/** 一个字符占几格。朴素模型:汉字/全角 = 1,半角 = 0.5 */
function cellWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  // ASCII 可见字符 + 半角空格
  if (c >= 0x20 && c <= 0x7e) return 0.5;
  return 1;
}

/**
 * 行内的一截 —— 同一字体角色的连续字符。
 * 一行可以跨多个 run(「第一条  为深入贯彻…」的首行就同时含黑体序号和仿宋正文),
 * 所以行不能只带一个字体,预览要按截画,否则会把整段画成序号的黑体、与产物矛盾。
 */
export type LaidSeg = { text: string; role?: FontRole };
export type LaidLine = { segs: LaidSeg[]; text: string; cells: number };

/** 把同角色的相邻字符并成一截 */
function packSegs(chars: { ch: string; role?: FontRole }[]): LaidSeg[] {
  const segs: LaidSeg[] = [];
  for (const c of chars) {
    const last = segs[segs.length - 1];
    if (last && last.role === c.role) last.text += c.ch;
    else segs.push({ text: c.ch, role: c.role });
  }
  return segs;
}

/**
 * 把若干 run 铺进网格。**run 级**,不是段级 —— 见 LaidSeg 的注释。
 * @param capacity 每行格数
 * @param firstIndentCells 首行缩进格数
 */
export function layoutRuns(
  runs: readonly DocRun[],
  capacity: number,
  firstIndentCells: number,
): LaidLine[] {
  // 按码点切,别按 UTF-16 码元(会切碎生僻字);首尾空白已由 recognize.cleanText 剥过
  const chars = runs.flatMap((r) => Array.from(r.text).map((ch) => ({ ch, role: r.role })));
  while (chars.length && /^[\s\u3000]$/u.test(chars[0].ch)) chars.shift();
  while (chars.length && /^[\s\u3000]$/u.test(chars[chars.length - 1].ch)) chars.pop();
  if (!chars.length) return [{ segs: [], text: '', cells: 0 }];

  const lines: LaidLine[] = [];
  let cur: { ch: string; role?: FontRole }[] = [];
  let cells = firstIndentCells;
  const flush = () => {
    lines.push({ segs: packSegs(cur), text: cur.map((c) => c.ch).join(''), cells });
  };

  for (const c of chars) {
    const w = cellWidth(c.ch);
    if (cells + w > capacity + 1e-9) {
      // 行首禁则:标点不另起一行,挂在本行行尾
      // (Word 的真实机制是压缩整行标点把它塞进版心,净效果与悬挂一致 —— 都是不换行)
      if (NO_LINE_START.has(c.ch)) {
        cur.push(c);
        cells += w;
        continue;
      }
      flush();
      cur = [c];
      cells = w;
    } else {
      cur.push(c);
      cells += w;
    }
  }
  flush();
  return lines;
}

/** 单段纯文本铺网格(不关心字体的调用方用它) */
export function layoutParagraph(
  text: string,
  capacity: number,
  firstIndentCells: number,
): LaidLine[] {
  return layoutRuns([{ text }], capacity, firstIndentCells);
}

export type OrphanHit = {
  index: number;
  lines: number;
  tailCells: number;
  tailText: string;
};

/**
 * 孤字扫描。判据:段落 ≥2 行,且末行实占格数 ≤ maxTailCells。
 * 阈值默认 2(一个字 + 一个句号)是**故意放宽**的 —— 模型误差双向 ±1 字,收紧会漏报。
 */
export function findOrphans(els: DocElement[], cfg: DocFormatConfig): OrphanHit[] {
  if (!cfg.orphanWarn.enabled) return [];
  const hits: OrphanHit[] = [];
  for (const el of els) {
    const style = cfg.elements[el.type];
    if (!style.emit) continue;
    const lines = layoutRuns(el.runs, cfg.grid.charsPerLine, style.firstLineChars / 100);
    if (lines.length < 2) continue;
    const tail = lines[lines.length - 1];
    if (tail.cells > 0 && tail.cells <= cfg.orphanWarn.maxTailCells) {
      hits.push({
        index: el.index,
        lines: lines.length,
        tailCells: tail.cells,
        tailText: tail.text,
      });
    }
  }
  return hits;
}

export type PreviewLine = {
  /** 按字体角色切好的截 —— 预览必须按它画,不能整行套 elements[type].font */
  segs: LaidSeg[];
  text: string;
  type: ElementType;
  first: boolean;
  indentCells: number;
};
export type PreviewPage = { pageNo: number; lines: PreviewLine[] };

/** 给前端预览用的分页。仅「示意」—— 最终以 Word 排版为准 */
export function paginate(els: DocElement[], cfg: DocFormatConfig): PreviewPage[] {
  const { linesPerPage } = metricsOf(cfg);
  const pages: PreviewPage[] = [];
  let cur: PreviewLine[] = [];
  let pageNo = cfg.pageNumber.startAt;
  // 首页版头预留:输出不含红头,但用户后续套红头会占掉首页若干行
  let used = Math.max(0, cfg.orphanWarn.firstPageOffsetLines);

  const push = (line: PreviewLine) => {
    if (used >= linesPerPage) {
      pages.push({ pageNo: pageNo++, lines: cur });
      cur = [];
      used = 0;
    }
    cur.push(line);
    used++;
  };

  for (const el of els) {
    const style = cfg.elements[el.type];
    if (!style.emit) continue;
    if (style.pageBreakBefore && cur.length) {
      pages.push({ pageNo: pageNo++, lines: cur });
      cur = [];
      used = 0;
    }
    const blank = { segs: [], text: '', type: el.type, first: false, indentCells: 0 };
    for (let i = 0; i < (style.spaceBeforeLines ?? 0); i++) push({ ...blank });
    const indent = style.firstLineChars / 100;
    // 走 runs 不走 text:「第X条」的序号与正文字体不同,预览要如实画出来
    layoutRuns(el.runs, cfg.grid.charsPerLine, indent).forEach((ln, i) => {
      push({
        segs: ln.segs,
        text: ln.text,
        type: el.type,
        first: i === 0,
        indentCells: i === 0 ? indent : 0,
      });
    });
    for (let i = 0; i < (style.spaceAfterLines ?? 0); i++) push({ ...blank });
  }
  if (cur.length) pages.push({ pageNo, lines: cur });
  return pages;
}
