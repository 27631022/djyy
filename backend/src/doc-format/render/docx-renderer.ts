/**
 * 排版引擎:元素 + 模板参数 → .docx。
 *
 * 分工:**我们只写 XML,排版交给 Word/WPS**。服务端不装字体、不渲染、不导 PDF ——
 * 方正字库是商业授权(见 README「版权红线」),服务端只写字体「名字」这个字符串。
 *
 * ⚠ 本文件踩过的坑,改之前先读:
 * 1. LineRuleType 有 EXACTLY:"exactly" 和 EXACT:"exact" 两个常量,只有后者是 spec 合法值。
 * 2. 页边距必须传 twips 整数;传 "3.7cm" 这种字符串会被库原样透传进 XML。
 * 3. updateFields 必须写在 features:{} 里,写顶层会被**静默忽略**(库对写错的选项名不报错)。
 * 4. 也因为 3,本文件一律用字面量直接构造 Document 选项,**不要**先攒进变量再展开 ——
 *    TS 的多余属性检查只在对象字面量被直接定型时才触发,一 spread 就静默失效。
 * 5. firstLineChars 是权威值,firstLine 是缓存值:有字符网格时它 = 缩进字数 × 字符跨度,
 *    **不是** 缩进字数 × 字号(26 字网格下 2 字缩进 = 680 twips 而非 640)。
 * 6. docGrid 的 charSpace 以「已解析的默认段落字号」为基准,所以必须用 docDefaults 把它钉死,
 *    否则基准会掉到引擎内置的 sz=20,每行字数整个算错。
 */
import {
  AlignmentType,
  Document,
  DocumentGridType,
  Footer,
  LineRuleType,
  PageNumber,
  Paragraph,
  Packer,
  TextRun,
} from 'docx';
import JSZip from 'jszip';
import type { Align, DocElement, DocFormatConfig, FontRole } from '../types';
import { TWIPS_PER_PT, metricsOf, mmToTwips } from '../grid';

/** OOXML 字号单位是半磅 */
const HALF_POINT = 2;

const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.BOTH,
};

/** 正文基准字号 —— docGrid 的 charSpace 以它为基准算每行字数 */
function baseSizePt(cfg: DocFormatConfig): number {
  return cfg.elements.body.sizePt;
}

/**
 * w:charSpace 的单位 = **1/4096 磅**(不是 twips!)。
 *
 * 这个值是实测反推的,不是查来的 —— 用 Word COM 把 PageSetup.CharsLine 依次设成 24/26/27/28
 * 让 Word 自己写出 docGrid,得到 charSpace = 9941 / 4135 / 1554 / -842,再与
 * (版心宽/N − 基准字号) 回归,比值恒为 204.8 = 4096/20。
 *
 * ⚠ 曾经按「charSpace = 字距的 twips 数」算(即 ÷20),得 charSpace=20,
 *   Word 实测排成**每行 27 字**而不是 26 —— 差一个字,而且肉眼极难发现。凡改这里必须用
 *   COM 复核 PageSetup.CharsLine,不要相信算术自洽。
 */
const CHAR_SPACE_PER_PT = 4096;

/** 版心宽(twips)。必须用**写进 pgMar 的那个整数**算 —— Word 是从文件里的整数反推的 */
function textWidthTwips(cfg: DocFormatConfig): number {
  return (
    mmToTwips(cfg.page.widthMm) - mmToTwips(cfg.page.marginLeftMm) - mmToTwips(cfg.page.marginRightMm)
  );
}

/**
 * 昆仑物流每行 26 字:8845/26 = 340.19 twips/字 − 三号 320 twips = 20.19 twips = 1.0096 磅
 *   → ×4096 = 4135(与 Word 自己写的逐位相同)。
 * 国标每行 28 字 → -842(负值合法,Word 自己也这么写)。
 * 取整用 floor 不是 round:实测 27 字(1554.96→1554)与 28 字(-841.14→-842)只有 floor 对得上。
 */
function charSpaceOf(cfg: DocFormatConfig): number {
  const pitchTwips = textWidthTwips(cfg) / cfg.grid.charsPerLine;
  const baseTwips = baseSizePt(cfg) * TWIPS_PER_PT;
  return Math.floor(((pitchTwips - baseTwips) / TWIPS_PER_PT) * CHAR_SPACE_PER_PT);
}

function fontOf(cfg: DocFormatConfig, role: FontRole) {
  const name = cfg.fonts[role];
  // ascii 也给同一字库:公文里的数字/字母与汉字同体(实测样本即如此)
  return { ascii: name, eastAsia: name, hAnsi: name, hint: 'eastAsia' as const };
}

/** 一个元素 → 一个段落 */
function toParagraph(el: DocElement, cfg: DocFormatConfig): Paragraph {
  const style = cfg.elements[el.type];
  const { charPitchPt } = metricsOf(cfg);
  const lineTwips = Math.round(cfg.grid.lineSpacingPt * TWIPS_PER_PT);
  const indentCells = style.firstLineChars / 100;
  const rightCells = (style.rightIndentChars ?? 0) / 100;

  return new Paragraph({
    alignment: ALIGN[style.align],
    // 孤行/寡行/标题孤立交给渲染端自己避 —— 它比我们准,且这是它唯一能自动修的一类
    widowControl: cfg.widowControl,
    keepNext: style.keepNext ?? false,
    pageBreakBefore: style.pageBreakBefore ?? false,
    spacing: {
      line: lineTwips,
      lineRule: LineRuleType.EXACT, // 不是 EXACTLY —— 那个会写出 spec 非法的 "exactly"
      before: Math.round((style.spaceBeforeLines ?? 0) * lineTwips),
      after: Math.round((style.spaceAfterLines ?? 0) * lineTwips),
    },
    indent: {
      firstLineChars: style.firstLineChars || undefined,
      // 缓存值必须按「字符跨度」算,不是按字号(见文件头坑 5)
      firstLine: indentCells ? Math.round(indentCells * charPitchPt * TWIPS_PER_PT) : undefined,
      right: rightCells ? Math.round(rightCells * charPitchPt * TWIPS_PER_PT) : undefined,
    },
    children: el.runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          font: fontOf(cfg, r.role ?? style.font),
          size: style.sizePt * HALF_POINT,
          // 全篇加粗开关(用户「所有字体符号都要加黑」)与元素自带 bold 取或
          bold: cfg.boldAll || (style.bold ?? false),
        }),
    ),
  });
}

/** 页码段:「— 1 —」,PAGE 域 */
function pageNumberFooter(cfg: DocFormatConfig, align: Align): Footer {
  const pn = cfg.pageNumber;
  const font = fontOf(cfg, pn.font);
  const size = pn.sizePt * HALF_POINT;
  const bold = cfg.boldAll; // 页码也是「字体符号」,一起加黑
  return new Footer({
    children: [
      new Paragraph({
        alignment: ALIGN[align],
        // 页脚不套正文的 28 磅固定行距 —— 那是版心的行网格,页码不在版心里
        children: [
          new TextRun({ text: `${pn.dash} `, font, size, bold }),
          new TextRun({ children: [PageNumber.CURRENT], font, size, bold }),
          new TextRun({ text: ` ${pn.dash}`, font, size, bold }),
        ],
      }),
    ],
  });
}

export function buildDocument(els: DocElement[], cfg: DocFormatConfig): Document {
  const body = els.filter((e) => cfg.elements[e.type].emit);
  const lineTwips = Math.round(cfg.grid.lineSpacingPt * TWIPS_PER_PT);
  const base = baseSizePt(cfg);

  return new Document({
    // updateFields 必须在 features 里(坑 3):PAGE 域没有缓存结果,靠它让 Word 打开即重算
    features: { updateFields: true },
    evenAndOddHeaderAndFooters: cfg.pageNumber.enabled,
    // ⚠ 不要在这里加 `fonts:` —— docx 的 FontOptions 是 { name, data: Buffer } = **嵌入字体文件**,
    //   而方正字库是商业授权,嵌入即踩版权红线。备选字体(altName,只写名字不含字节)由
    //   patchFontTable 后处理写入。
    styles: {
      // 钉死 docGrid 的基准字号与基准字体(坑 6)
      default: {
        document: {
          run: { font: fontOf(cfg, 'body'), size: base * HALF_POINT },
          paragraph: { spacing: { line: lineTwips, lineRule: LineRuleType.EXACT } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwips(cfg.page.widthMm), height: mmToTwips(cfg.page.heightMm) },
            // 必须是 twips 整数(坑 2)
            margin: {
              top: mmToTwips(cfg.page.marginTopMm),
              bottom: mmToTwips(cfg.page.marginBottomMm),
              left: mmToTwips(cfg.page.marginLeftMm),
              right: mmToTwips(cfg.page.marginRightMm),
              footer: mmToTwips(cfg.pageNumber.fromBottomMm),
            },
            pageNumbers: { start: cfg.pageNumber.startAt },
          },
          // 每行字数就落在这里
          grid: {
            type: DocumentGridType.LINES_AND_CHARS,
            linePitch: lineTwips,
            charSpace: charSpaceOf(cfg),
          },
        },
        footers: cfg.pageNumber.enabled
          ? {
              default: pageNumberFooter(cfg, cfg.pageNumber.oddAlign),
              even: pageNumberFooter(cfg, cfg.pageNumber.evenAlign),
            }
          : undefined,
        children: body.map((e) => toParagraph(e, cfg)),
      },
    ],
  });
}

/** XML 文本转义(只用于我们自己拼的字体名) */
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * 后处理 word/fontTable.xml,给每个字体声明一个备选字体(w:altName)。
 *
 * 为什么要后处理:docx 库没有「只声明不嵌入」的 API(它的 fonts 选项要 Buffer = 嵌入字体文件,
 * 踩版权红线),而它自己生成的 fontTable.xml 是个 0 条目的空壳。
 * altName 是 OOXML 唯一的备选机制,只有一级(不是字体链):指定字库装了 → 用它;没装 → 查 altName,
 * 装了就用;altName 也没装 → 掉到系统默认(实测 WPS 上是 SimSun,全篇一个字体、明显不对)。
 * 这里只写字体「名字」字符串,不含任何字体字节。
 */
async function patchFontTable(buf: Buffer, cfg: DocFormatConfig): Promise<Buffer> {
  const pairs = (Object.entries(cfg.fontFallback) as [FontRole, string | undefined][])
    .filter(([role, alt]) => alt && cfg.fonts[role])
    .map(([role, alt]) => [cfg.fonts[role], alt as string] as const);
  // 同一字库可能被多个角色引用,去重
  const uniq = new Map(pairs);
  if (!uniq.size) return buf;

  const zip = await JSZip.loadAsync(buf);
  const file = zip.file('word/fontTable.xml');
  if (!file) return buf;
  const xml = await file.async('string');
  const decls = [...uniq]
    .map(([name, alt]) => `<w:font w:name="${esc(name)}"><w:altName w:val="${esc(alt)}"/></w:font>`)
    .join('');

  // ⚠ docx 库产出的是**自闭合空标签** `<w:fonts .../>`(它自己不写任何字体条目)。
  //   曾用 /(<w:fonts\b[^>]*>)/ 当「开标签」匹配 —— [^>]* 会把末尾的 / 一起吃进去,
  //   于是 decls 被追加到自闭合标签**之后**,产出 5 个根元素的非法 XML,altName 也没进字体表。
  //   所以这里必须先认自闭合形态,把它撑开成 <w:fonts ...>…</w:fonts>。
  // ⚠ 替换串一律走函数形式:字符串形式会展开 $& / $1 等模式,而字体名来自用户配置。
  const selfClosing = /<w:fonts\b([^>]*?)\s*\/>/;
  const openTag = /<w:fonts\b([^>]*)>/;
  let patched: string;
  if (selfClosing.test(xml)) {
    patched = xml.replace(selfClosing, (_m, attrs: string) => `<w:fonts${attrs}>${decls}</w:fonts>`);
  } else if (openTag.test(xml)) {
    patched = xml.replace(openTag, (m) => `${m}${decls}`);
  } else {
    return buf; // 结构不认识就别硬改,宁可没有 altName
  }
  zip.file('word/fontTable.xml', patched);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function renderDocx(els: DocElement[], cfg: DocFormatConfig): Promise<Buffer> {
  const buf = await Packer.toBuffer(buildDocument(els, cfg));
  return patchFontTable(buf, cfg);
}
