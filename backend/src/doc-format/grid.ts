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

/**
 * 避头尾字符表 —— **照抄 Word/WPS 自己的**,不是照抄国标。
 *
 * 理由:断行是渲染端做的,我们的模型要预测它的行为,那就该镜像它的表。
 * 来源可复现(简体中文 zh-CN / FarEastLineBreakLevel=0「标准」):
 *   $doc = (New-Object -ComObject Word.Application).Documents.Add()
 *   $doc.NoLineBreakBefore   # 45 字符
 *   $doc.NoLineBreakAfter    # 19 字符
 *
 * ⚠ 别按印象手写。原先手写的版本两个方向都错:多了 —(U+2014,Word 用的是 ―U+2015)和 %‰℃,
 *   漏了 ¨ˇˉ‖∶〃々〗＂＇．｀｜￠ 与全角 ！），．：；？］～。
 * ⚠ GB/T 15834-2011 只零散规定了省略号/连接号/间隔号/分隔号不出现在行首,没有完整字符表,
 *   且它管的是「标点用法」不是「排版断行」—— 拿它当断行依据会与 Word 实际行为对不上。
 * ⚠ 这是「标准」级。用户若把 Word 改成「严格」级,表会变大、断行随之不同 —— 我们不写
 *   settings.xml 的 kinsoku 设置,所以跟随用户本机默认(简体中文出厂就是标准级)。
 *   这也是孤字只能报「疑似」的原因之一。
 */
const NO_LINE_START = new Set(
  '!),.:;?]}¨·ˇˉ―‖’”…∶、。〃々〉》」』】〕〗！＂＇），．：；？］｀｜｝～￠',
);

/** 行尾禁则:这些字符不能收尾(如「《」),否则整个连它一起推到下一行 */
const NO_LINE_END = new Set('([{·‘“〈《「『【〔〖（．［｛￡￥');

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
  const cellsOf = (arr: { ch: string }[]) => arr.reduce((s, x) => s + cellWidth(x.ch), 0);
  const flush = () => {
    lines.push({ segs: packSegs(cur), text: cur.map((c) => c.ch).join(''), cells });
  };

  for (const c of chars) {
    const w = cellWidth(c.ch);
    if (cells + w > capacity + 1e-9) {
      // 行首禁则:标点不另起一行,挂在本行行尾。
      // (Word 的真实机制是压缩整行标点把它塞进版心,净效果与悬挂一致 —— 都是不换行)
      if (NO_LINE_START.has(c.ch)) {
        cur.push(c);
        cells += w;
        continue;
      }
      // 行尾禁则:本行末尾若是「《」这类不能收尾的字符,把它(们)一起带到下一行
      const carry: { ch: string; role?: FontRole }[] = [];
      while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1].ch)) carry.unshift(cur.pop()!);
      cells = cellsOf(cur) + (lines.length === 0 ? firstIndentCells : 0);
      flush();
      cur = [...carry, c];
      cells = cellsOf(cur);
    } else {
      cur.push(c);
      cells += w;
    }
  }
  flush();
  return lines;
}

/**
 * 段末行是否「孤」。findOrphans(告警)与 paginate(预览标黄)共用同一判据 ——
 * 两处分别实现的话,告警说有、画面不标黄,用户就更找不到了。
 * @returns 孤字所在行的下标;不孤则 null
 */
function orphanTailIndex(lines: LaidLine[], cfg: DocFormatConfig): number | null {
  if (!cfg.orphanWarn.enabled || lines.length < 2) return null;
  const tail = lines[lines.length - 1];
  return tail.cells > 0 && tail.cells <= cfg.orphanWarn.maxTailCells ? lines.length - 1 : null;
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
  /** 在预览的第几页 —— 光说「第 N 段」用户数不出来,得给能找得到的坐标 */
  pageNo?: number;
};

/**
 * 孤字扫描。判据:段落 ≥2 行,且末行实占格数 ≤ maxTailCells。
 * 阈值默认 2(一个字 + 一个句号)是**故意放宽**的 —— 模型误差双向 ±1 字,收紧会漏报。
 */
export function findOrphans(els: DocElement[], cfg: DocFormatConfig): OrphanHit[] {
  const hits: OrphanHit[] = [];
  for (const el of els) {
    const style = cfg.elements[el.type];
    if (!style.emit) continue;
    const lines = layoutRuns(el.runs, cfg.grid.charsPerLine, style.firstLineChars / 100);
    const at = orphanTailIndex(lines, cfg);
    if (at === null) continue;
    hits.push({
      index: el.index,
      lines: lines.length,
      tailCells: lines[at].cells,
      tailText: lines[at].text,
    });
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
  /** 疑似孤字的那一行 —— 预览标黄。光在告警里说「第 N 段」用户数不出来 */
  orphan?: boolean;
  /** 所属段落号(标黄的行要能和上方告警列表对上) */
  index?: number;
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
    const laid = layoutRuns(el.runs, cfg.grid.charsPerLine, indent);
    const orphanAt = orphanTailIndex(laid, cfg);
    laid.forEach((ln, i) => {
      push({
        segs: ln.segs,
        text: ln.text,
        type: el.type,
        first: i === 0,
        indentCells: i === 0 ? indent : 0,
        orphan: i === orphanAt || undefined,
        index: el.index,
      });
    });
    for (let i = 0; i < (style.spaceAfterLines ?? 0); i++) push({ ...blank });
  }
  if (cur.length) pages.push({ pageNo, lines: cur });
  return pages;
}
