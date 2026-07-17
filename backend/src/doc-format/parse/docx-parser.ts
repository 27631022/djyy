/**
 * .docx(真 OOXML)解析:jszip + saxes 直接遍历 <w:p>。
 *
 * 为什么不用 mammoth(项目其它地方在用,这里不能用):
 * 公文是 100% 直接排版,不用命名样式 —— 实测「请示·党委审议稿.docx」里 <w:pStyle> = 0 个,
 * 而 <w:jc> 36 个、<w:sz> 199 个、<w:rFonts> 198 个。mammoth 只认命名样式,convertToHtml
 * 输出全是裸 <p>,居中/字号/字体/表格全丢,**且不报任何警告** —— 静默失败,最坏的那种。
 */
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import type { RawParagraph } from '../recognize';

/** OOXML 里字号是「半磅」*/
const HALF_POINT = 2;

type Ctx = {
  paras: RawParagraph[];
  cur: { text: string; align?: string; bold?: boolean; sizePt?: number; fontEA?: string } | null;
  /** 嵌套深度:>0 表示在表格里 */
  tblDepth: number;
  /** 在 <w:pPr> 内 —— 里面的 <w:rPr> 是段落标记的属性,不是正文 run 的,不能当内容样式 */
  inPPr: boolean;
  /** 在 <w:instrText>/<w:fldChar> 域代码内 —— 里面的文本是「PAGE」这种指令,不是正文 */
  inField: boolean;
  /**
   * 在 <w:del>(修订模式删除)内 —— 里面的 <w:delText> 是**被删掉的字**,绝不能当正文。
   * 公文常带修订痕迹,不剔除会把已删除的内容复活到成品里(法律风险)。
   */
  inDel: boolean;
  /** 已见过内容 run(用于「首个 run 定基调」) */
  seenRun: boolean;
};

function flush(ctx: Ctx): void {
  if (!ctx.cur) return;
  ctx.paras.push({
    index: ctx.paras.length,
    text: ctx.cur.text,
    align: ctx.cur.align,
    bold: ctx.cur.bold,
    sizePt: ctx.cur.sizePt,
    fontEA: ctx.cur.fontEA,
    isTable: ctx.tblDepth > 0,
  });
  ctx.cur = null;
}

/** 从 document.xml 抽段落 */
export function parseDocumentXml(xml: string): RawParagraph[] {
  const ctx: Ctx = {
    paras: [],
    cur: null,
    tblDepth: 0,
    inPPr: false,
    inField: false,
    inDel: false,
    seenRun: false,
  };
  const parser = new SaxesParser();

  parser.on('opentag', (node) => {
    const a = node.attributes as Record<string, string>;
    switch (node.name) {
      case 'w:tbl':
        ctx.tblDepth++;
        break;
      case 'w:p':
        flush(ctx); // 防御:嵌套/未闭合时不丢内容
        ctx.cur = { text: '' };
        ctx.seenRun = false;
        break;
      case 'w:pPr':
        ctx.inPPr = true;
        break;
      case 'w:jc':
        if (ctx.cur && ctx.inPPr) ctx.cur.align = a['w:val'];
        break;
      case 'w:b':
        // 只认内容 run 的加粗,且只取首个 run(整段基调)
        if (ctx.cur && !ctx.inPPr && !ctx.seenRun) ctx.cur.bold = a['w:val'] !== '0' && a['w:val'] !== 'false';
        break;
      case 'w:sz':
        if (ctx.cur && !ctx.inPPr && !ctx.seenRun) {
          const n = Number(a['w:val']);
          if (Number.isFinite(n)) ctx.cur.sizePt = n / HALF_POINT;
        }
        break;
      case 'w:rFonts':
        if (ctx.cur && !ctx.inPPr && !ctx.seenRun) ctx.cur.fontEA = a['w:eastAsia'] || a['w:ascii'];
        break;
      case 'w:instrText':
        ctx.inField = true;
        break;
      case 'w:del':
        ctx.inDel = true;
        break;
      case 'w:tab':
        if (ctx.cur && !ctx.inPPr && !ctx.inDel) ctx.cur.text += '\t';
        break;
      case 'w:br':
        // 段内换行 → 用空格分隔(手工断行的标题不能把两行黏成一个词)。分页符不产生文本
        if (ctx.cur && !ctx.inDel && a['w:type'] !== 'page') ctx.cur.text += ' ';
        break;
      default:
        break;
    }
  });

  parser.on('text', (t) => {
    // inField:域代码(PAGE 等指令);inDel:修订删除的字(w:delText)—— 都不是正文
    if (ctx.cur && !ctx.inField && !ctx.inDel) ctx.cur.text += t;
  });

  parser.on('closetag', (node) => {
    switch (node.name) {
      case 'w:tbl':
        ctx.tblDepth = Math.max(0, ctx.tblDepth - 1);
        break;
      case 'w:p':
        flush(ctx);
        break;
      case 'w:pPr':
        ctx.inPPr = false;
        break;
      case 'w:instrText':
        ctx.inField = false;
        break;
      case 'w:del':
        ctx.inDel = false;
        break;
      case 'w:r':
        if (!ctx.inPPr) ctx.seenRun = true;
        break;
      default:
        break;
    }
  });

  parser.write(xml).close();
  flush(ctx);
  return ctx.paras;
}

/**
 * document.xml 解压后的上限。一份公文正文再长也就几 MB(实测最大样本 66KB),
 * 给 64MB 余量足够;超过它基本是 zip bomb(高压缩比条目 async 会把整条解进内存)。
 */
const DOCUMENT_XML_MAX = 64 * 1024 * 1024;

/** JSZip 中央目录里声明的解压后大小 —— 读元数据,不解压,用来在 async 前拦 zip bomb */
function declaredSize(entry: JSZip.JSZipObject): number {
  const d = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  return d?.uncompressedSize ?? 0;
}

export async function parseDocx(buf: Buffer): Promise<RawParagraph[]> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('不是有效的 .docx:缺 word/document.xml');
  if (declaredSize(entry) > DOCUMENT_XML_MAX) {
    throw new Error('文档正文过大或疑似恶意压缩,已拒绝');
  }
  return parseDocumentXml(await entry.async('string'));
}
