/**
 * 结构识别:段落文本 → 元素类型 + run 切分。纯规则,不用 AI。
 *
 * 为什么不用 AI(2026-07-17 定案):
 * - 不需要 —— 下面这张「序号字形 → 元素类型」表实测跨 请示/办法(条例体)/表彰决定 三种文种
 *   8/8 全命中,零文种检测。层次序数是 GB/T 9704-2012 §7.3.3 的固定序列,与文种无关。
 * - 有风险 —— 让大模型过一遍正文,它就有机会改标点/吞字/「优化」措辞。公文一字不能错。
 * 规则拿不准的段落标 confidence='low',交人工在确认页改 —— 人是这里的质量闸门,不是 AI。
 *
 * 源文档的字体/加粗不能当判据(实测:OA 产出的 .doc 全篇 100% 粗体是 WPS 伪影、零信息;
 * 请示稿里 9 个「(N)」用楷体而第 10 个「(四)」错用仿宋)。所以一律以正文正则为主判据 ——
 * 这恰恰是本功能的价值:它能修掉源文件里的这类错。
 */
import type { DocElement, DocFormatConfig, DocRun, ElementType } from './types';

/** 解析器给出的原始段落。align/bold/sizePt 仅 .docx 有,只作辅助提示,不作判据 */
export type RawParagraph = {
  index: number;
  text: string;
  align?: string;
  bold?: boolean;
  sizePt?: number;
  fontEA?: string;
  isTable?: boolean;
};

const CN_NUM = '一二三四五六七八九十百零〇';

/** 第X章 */
const RE_CHAPTER = new RegExp(`^第[${CN_NUM}]+章`);
/** 第X条 —— 切分用,须捕获组 */
const RE_ARTICLE = new RegExp(`^(第[${CN_NUM}]+条)([ \\u3000]*)(.*)$`);
/** 一、 —— 注意排除「一。」「一)」这类非序号 */
const RE_LEVEL1 = new RegExp(`^[${CN_NUM}]+、`);
/** (一) 全角/半角括号 */
const RE_LEVEL2 = new RegExp(`^[（(][${CN_NUM}]+[）)]`);
/**
 * 1. / 1、—— 必须排除「1.5万元」这类小数。
 * 判据:点号后不能紧跟数字。
 */
const RE_LEVEL3 = /^\d+(?:[.．](?!\d)|、)/;
/** (1) */
const RE_LEVEL4 = /^[（(]\d+[）)]/;
/** 发文字号「物流党发〔2026〕24号」 */
const RE_DOC_NUMBER = /^[一-龥A-Za-z]{2,20}〔\d{4}〕第?\d+号$/;
/** 成文日期 */
const RE_DATE = /^\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日$/;
/** 附件说明「附件:xxx」 */
const RE_ATTACHMENT_NOTE = /^附件\s*\d*\s*[:：]/;
/** 附件标记 —— 独占一段的「附件」「附件1」 */
const RE_ATTACHMENT_MARK = /^附件\s*\d*$/;
/** 主送机关:以冒号结尾 */
const RE_RECIPIENT = /[:：]$/;
/** 落款的机关特征 */
const RE_ORG_HINT = /(委员会|党委|党组|党总支|党支部|公司|政府|办公室|部$|局$|厅$|处$)/;
/** 句末标点 */
const RE_SENTENCE_END = /[。！？；]$/;

/** 版头/版记里出现的标记词 */
const RE_VERSION_NOTE = /(抄送|印发)/;

/** 标题区最多几段(国标:标题回行一般不超过 3 行,留 4 作安全上限) */
const MAX_TITLE_PARAS = 4;
/** 「像正文」的长度阈值 —— 超过它就不可能是标题行 */
const BODY_LEN_HINT = 40;
/** 版头残片(如红头图片只泄漏出的一个「件」字)的扫描范围 */
const HEADER_SCAN_PARAS = 10;
const HEADER_FRAGMENT_LEN = 3;

/** 结构性元素:它们一出现,标题区就结束了 */
const STRUCTURAL: ReadonlySet<ElementType> = new Set<ElementType>([
  'recipient',
  'chapter',
  'article',
  'level1',
  'level2',
  'level3',
  'level4',
  'attachmentNote',
  'attachmentMark',
  'date',
]);

/**
 * 清洗段落文本。
 * - 去掉 \r 与 \x07(word-extractor 用 \x07 标单元格/行尾)
 * - **去掉段首段尾空白**:段首那些是作者用空格手打的缩进,我们自己会按 firstLineChars 排,
 *   留着就变成「源空格 + 首行缩进」两份(实测某段缩进 7.74 字而非 2 字,比左右邻居多缩 5.7 字)。
 *   而且 grid.ts 全程按 trim 后的文本算行 —— 不 trim 的话预览说 2 字、产物 7.74 字,静默分叉。
 * - **保留段内空格** —— 「总  则」的空格是二字标题疏排惯例、「聂  伟」是两字姓名的公文写法,
 *   normalize 掉就把人家排好的东西弄坏了
 */
export function cleanText(raw: string): string {
  // word-extractor 用 \u0007 标单元格/行尾,不剥掉会混进正文当普通字符参与断行。
  // eslint-disable-next-line no-control-regex -- 就是要匹配这个控制字符,不是笔误
  const noMark = raw.replace(/[\r\u0007]/gu, '');
  // \u3000 = 全角空格。段首段尾都去,段内的不能动(见上方注释)
  return noMark.replace(/^[\s\u3000]+|[\s\u3000]+$/gu, '');
}

/** 第一趟:逐段按字形打型(不含需要位置信息的 title/signature) */
function classifyOne(p: RawParagraph, text: string): { type: ElementType; note?: string } | null {
  if (!text || !text.trim()) return { type: 'skip' };

  // 版记(抄送/印发)——源文件里是表格,提取出来带制表符
  if (text.includes('\t') && RE_VERSION_NOTE.test(text)) {
    return { type: 'skip', note: '版记(抄送/印发),不在排版范围' };
  }

  const t = text.replace(/\t/g, ' ').trim();

  if (RE_DOC_NUMBER.test(t)) return { type: 'docNumber', note: '版头元素,默认不输出' };
  if (RE_CHAPTER.test(t)) return { type: 'chapter' };
  if (RE_ARTICLE.test(t)) return { type: 'article' };
  if (RE_LEVEL1.test(t)) return { type: 'level1' };
  if (RE_LEVEL2.test(t)) return { type: 'level2' };
  if (RE_LEVEL4.test(t)) return { type: 'level4' }; // (1) 必须先于 1. 判,否则永远轮不到
  if (RE_LEVEL3.test(t)) return { type: 'level3' };
  if (RE_ATTACHMENT_MARK.test(t)) return { type: 'attachmentMark' };
  if (RE_ATTACHMENT_NOTE.test(t)) return { type: 'attachmentNote' };
  if (RE_DATE.test(t)) return { type: 'date' };

  // 版头残片:红头是图片/文本框,纯文本提取常常只漏出一两个字
  if (p.index < HEADER_SCAN_PARAS && t.length <= HEADER_FRAGMENT_LEN) {
    return { type: 'skip', note: '疑似版头残片(红头是图片,提取不到)' };
  }

  return null;
}

/** 找标题区:从首个实体段起,到首个结构性元素或首个「像正文」的段为止 */
function markTitle(items: { type: ElementType | null; text: string }[]): void {
  let taken = 0;
  for (const it of items) {
    if (it.type === 'skip' || it.type === 'docNumber') continue;
    if (it.type !== null && STRUCTURAL.has(it.type)) break;
    const t = it.text.trim();
    // 「像正文」:长或以句末标点收尾 —— 标题不会这样
    if (t.length > BODY_LEN_HINT || RE_SENTENCE_END.test(t)) break;
    // 冒号结尾 = 主送机关,标题区到此为止(它紧跟在标题后面,不判会被当成标题的最后一行)
    if (RE_RECIPIENT.test(t)) break;
    it.type = 'title';
    if (++taken >= MAX_TITLE_PARAS) break;
  }
}

/** 主送机关:标题之后、正文之前,以冒号结尾的那一段 */
function markRecipient(items: { type: ElementType | null; text: string }[]): void {
  for (const it of items) {
    if (it.type === 'skip' || it.type === 'docNumber' || it.type === 'title') continue;
    if (it.type !== null) break; // 已定型(章/条/层次…)→ 这篇没有主送
    if (RE_RECIPIENT.test(it.text.trim())) it.type = 'recipient';
    break; // 只看标题后的第一个未定型段
  }
}

/**
 * 落款:成文日期的前一个实体段。
 * 不能从文末倒扫 —— 附件在落款之后(实测「两优一先」:落款 22 / 日期 23 / 附件 35+)。
 */
function markSignature(items: { type: ElementType | null; text: string }[]): number[] {
  const low: number[] = [];
  items.forEach((it, i) => {
    if (it.type !== 'date') return;
    for (let j = i - 1; j >= 0; j--) {
      const prev = items[j];
      if (prev.type === 'skip') continue;
      if (prev.type !== null) break; // 前一实体段已定型 → 不是落款
      const t = prev.text.trim();
      if (t.length <= BODY_LEN_HINT && !RE_SENTENCE_END.test(t) && RE_ORG_HINT.test(t)) {
        prev.type = 'signature';
        low.push(j);
      }
      break;
    }
  });
  return low;
}

/**
 * 「第X条」的 run 级切分。
 * 实测该办法 19/19 命中:序号恒黑体;序号后含「。」→ 仿宋(行内条文,后面跟着大段正文)、
 * 不含「。」→ 黑体(独立短标题)。整段套黑体会把两百字正文全加粗 —— 这是本模块最大的坑。
 */
function splitArticle(text: string, cfg: DocFormatConfig): DocRun[] | null {
  const m = RE_ARTICLE.exec(text.trim());
  if (!m) return null;
  const [, num, gap, rest] = m;
  if (!cfg.articleRule.splitNumber) return null;
  if (!rest) return [{ text: num, role: cfg.articleRule.numberRole }];
  const role = rest.includes('。') ? cfg.articleRule.inlineRole : cfg.articleRule.standaloneRole;
  return [
    { text: num + gap, role: cfg.articleRule.numberRole },
    { text: rest, role },
  ];
}

/** 主入口 */
export function recognize(paragraphs: RawParagraph[], cfg: DocFormatConfig): DocElement[] {
  const items = paragraphs.map((p) => {
    const text = cleanText(p.text);
    const hit = classifyOne(p, text);
    return { type: hit?.type ?? null, note: hit?.note, text, raw: p };
  });

  markTitle(items);
  markRecipient(items);
  const sigIdx = new Set(markSignature(items));

  // 附件标记之后的第一个实体段 = 附件标题
  items.forEach((it, i) => {
    if (it.type !== 'attachmentMark') return;
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].type === 'skip') continue;
      if (items[j].type === null) items[j].type = 'attachmentTitle';
      break;
    }
  });

  return items.map((it, i) => {
    const type: ElementType = it.type ?? 'body';
    const runs = (type === 'article' && splitArticle(it.text, cfg)) || [{ text: it.text }];
    // 低置信:落款靠启发式;版头残片是猜的;标题靠位置推断
    const low = sigIdx.has(i) || (it.note?.startsWith('疑似') ?? false) || type === 'title';
    return {
      index: it.raw.index,
      type,
      runs,
      text: it.text,
      confidence: low ? 'low' : 'high',
      note: it.note ?? (type === 'title' ? '按位置推断为标题,请核对' : undefined),
    } satisfies DocElement;
  });
}
