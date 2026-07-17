/**
 * md → 公文 的结构转换:标题层级映射 + 自动补层次序号。
 *
 * 为什么要补序号:markdown 的层级写在 `#` 里(`## 总体要求`),而**公文的层次序数是写在正文里的**
 * (`一、总体要求`)。不补的话输出就不是公文 —— 只是把「总体要求」排成了黑体。
 *
 * ⚠ 这是本模块**唯一会凭空生成文字**的地方,与「正文一字不改」的原则有张力。之所以成立:
 *   - .doc/.docx 是「重排一份已定稿的公文」→ 绝不碰字;
 *   - .md 是「把草稿转成公文」→ 补序号是转换的题中之义,而且**补出来的序号在确认页看得见**。
 *   用户 2026-07-17 定案「自动补,可在模板里关」。已自带序号的标题不重复加。
 */
import type { ElementType } from './types';

/** markdown 标题层级 → 公文元素类型。h5/h6 并到第四层(公文层次序数只有四层) */
const HEADING_TYPE: Record<number, ElementType> = {
  1: 'title',
  2: 'level1',
  3: 'level2',
  4: 'level3',
  5: 'level4',
  6: 'level4',
};

export function typeOfMdHeading(depth: number): ElementType {
  return HEADING_TYPE[depth] ?? 'body';
}

const CN_DIGITS = '〇一二三四五六七八九';

/** 阿拉伯数字 → 汉字数字(公文序号只到几十,不必做完整算法) */
function cnNum(n: number): string {
  if (n <= 0) return String(n);
  if (n < 10) return CN_DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
  if (n < 100) {
    const t = Math.floor(n / 10);
    return CN_DIGITS[t] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
  }
  return String(n);
}

/**
 * 四级层次序数的字形。出自 GB/T 9704-2012 §7.3.3 的固定序列。
 * 空格照真实公文的写法:`一、`「、」自带分隔不加空格,`（一）`/`（1）` 括号自带分隔,
 * 只有 `1.` 的点号分隔力弱、后面跟一个空格(实测用户的办法/决定里都是「1. 申报推荐」)。
 */
function numberFor(type: ElementType, n: number): string {
  switch (type) {
    case 'level1':
      return `${cnNum(n)}、`;
    case 'level2':
      return `（${cnNum(n)}）`;
    case 'level3':
      return `${n}. `;
    case 'level4':
      return `（${n}）`;
    default:
      return '';
  }
}

/** 这段是不是已经自带序号了(自带就别重复加) */
const HAS_NUMBER: Partial<Record<ElementType, RegExp>> = {
  level1: /^[一二三四五六七八九十百零〇]+、/,
  level2: /^[（(][一二三四五六七八九十百零〇]+[）)]/,
  level3: /^\d+(?:[.．](?!\d)|、)/,
  level4: /^[（(]\d+[）)]/,
};

const NUMBERED: readonly ElementType[] = ['level1', 'level2', 'level3', 'level4'];

/** 层级序号计数器 —— 上一级一变,下面各级归零 */
export class MdNumbering {
  private counters = new Map<ElementType, number>();

  /** 给这一段配序号。返回要补的前缀(不需要补则空串) */
  next(type: ElementType, text: string): string {
    if (!NUMBERED.includes(type)) {
      // 遇到标题/章之类的上层元素,层次序号整体重来
      if (type === 'title' || type === 'chapter') this.counters.clear();
      return '';
    }
    // 本级 +1,更深的级别归零
    const at = NUMBERED.indexOf(type);
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    for (const deeper of NUMBERED.slice(at + 1)) this.counters.delete(deeper);
    // 已自带序号 → 不重复加(但计数照走,免得后面的接不上)
    if (HAS_NUMBER[type]?.test(text)) return '';
    return numberFor(type, n);
  }
}
