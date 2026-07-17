/**
 * .md 解析:Markdown → 段落 + 层级线索。
 *
 * 与 .doc/.docx 那两条管线的**根本不同**:它们是「重排一份已定稿的公文」(源里已有 一、/（一）
 * 这些序号,我们只换字体不碰字);而 md 是「把草稿转成公文」—— 标题层级写在 `#` 里而不是正文里,
 * 所以要把 h1..h6 映射成公文的元素类型,并按需补序号(见 md.autoNumber)。
 *
 * ⚠ 用 marked 的 lexer 走 token 树抽纯文本,**不要用正则剥标记** —— 正文里残留一个 `*`
 *   或 `&quot;` 就是公文错字。字段选择是实测定的(见下表),选错就会把 HTML 实体写进公文:
 *     text     → **raw**  (`text` 被 HTML 转义过:" → &quot;、& → &amp;、' → &#39;)
 *     escape   → **text** (`\*` 的 text 是 `*`,raw 还带反斜杠)
 *     html     → **丢弃** (`<b>` 这类标签本身)
 *     其余容器 → 递归 tokens
 */
import { lexer, type Token, type Tokens } from 'marked';
import type { RawParagraph } from '../recognize';

/** md 的标题层级(1-6),给 recognize 当权威线索 —— 正文里没有序号可认 */
export type MdParagraph = RawParagraph & { mdHeading?: number };

type AnyToken = Token & { tokens?: Token[]; text?: string; raw?: string; depth?: number };

/** 走 token 树抽纯文本 */
function plain(tokens: readonly Token[] | undefined): string {
  let out = '';
  for (const tk of tokens ?? []) {
    const t = tk as AnyToken;
    switch (t.type) {
      case 'text':
        // 有子 token 时以子树为准(marked 会把带行内标记的 text 再拆一层)
        out += t.tokens ? plain(t.tokens) : (t.raw ?? '');
        break;
      case 'escape':
        // `\*` 的 raw 带反斜杠,text 才是 `*`
        out += t.text ?? '';
        break;
      case 'html':
        break; // 行内标签本身丢掉;它包着的文字是独立的 text token,照常收
      case 'image':
        break; // 图片不在排版范围(只排正文)
      case 'br':
        out += ' '; // 段内硬换行 → 空格,别把两行黏成一个词
        break;
      case 'codespan':
        // ⚠ 必须从 raw 去反引号,不能用 text —— text 被 HTML 转义过(`a < b` 的 text = 'a &lt; b'),
        // 那些 &lt;/&amp;/&quot; 会原样进公文正文。raw 是 `` `a < b` ``,剥掉成对的反引号即得原文。
        out += stripCodeFence(t.raw ?? '');
        break;
      default:
        out += t.tokens ? plain(t.tokens) : (t.text ?? t.raw ?? '');
    }
  }
  return out;
}

/** 去掉行内代码 raw 首尾成对的反引号(可能是 ``、``` 等) */
function stripCodeFence(raw: string): string {
  const m = /^(`+)([\s\S]*?)\1$/.exec(raw.trim());
  if (!m) return raw;
  // CommonMark:紧贴反引号的单个空格是分隔符,要去掉
  return m[2].replace(/^ | $/g, '');
}

/** 一个块级 token → 若干段落文本 */
function blockToParas(tk: Token, push: (text: string, heading?: number) => void): void {
  const t = tk as AnyToken;
  switch (t.type) {
    case 'heading':
      push(plain(t.tokens), t.depth);
      break;
    case 'paragraph':
      push(plain(t.tokens));
      break;
    case 'blockquote':
      // 引用在公文里没有对应体例,按正文走
      for (const inner of (t as unknown as Tokens.Blockquote).tokens ?? []) blockToParas(inner, push);
      break;
    case 'list': {
      // 列表项各成一段。md 的 `1.` `-` 不是公文序号 —— 有序列表把序号还原进正文
      // (公文的层次序数就是写在正文里的),无序列表只取文字。
      const list = t as unknown as Tokens.List;
      const start = Number(list.start || 1);
      list.items.forEach((item, i) => {
        // ⚠ item.tokens 里可能夹着**子列表**(嵌套)。plain() 会把子 list 当行内文本揉进来,
        //   于是「父项」和子项的标记「- 子项」黏成一段。所以要把 item 的块级子节点分开处理:
        //   本项的行内文本自成一段,嵌套的子列表递归下去各自成段。
        const inlineTokens: Token[] = [];
        const blockTokens: Token[] = [];
        for (const child of item.tokens as Token[]) {
          if ((child as AnyToken).type === 'list' || (child as AnyToken).type === 'blockquote') {
            blockTokens.push(child);
          } else {
            inlineTokens.push(child);
          }
        }
        const body = plain(inlineTokens).trim();
        if (body) push(list.ordered ? `${start + i}. ${body}` : body);
        for (const b of blockTokens) blockToParas(b, push);
      });
      break;
    }
    case 'code':
      push(t.text ?? '');
      break;
    case 'html':
      break; // 块级 HTML(<!-- -->、<div>、<table> 等)不是正文,整块丢弃(与行内 html 一致)
    case 'table':
      // 表格不在排版范围(产品边界:只排正文;实测真实公文的表格都是版头/版记的排版家具)
      break;
    case 'space':
    case 'hr':
      break;
    default:
      if (t.tokens) for (const inner of t.tokens) blockToParas(inner, push);
      else if (t.text) push(t.text);
  }
}

export function parseMd(buf: Buffer): MdParagraph[] {
  // \uFEFF = BOM。Windows 上存的 md 常带它,不剥掉会混进第一段正文
  const src = buf.toString('utf8').replace(/^\uFEFF/, '');
  const paras: MdParagraph[] = [];
  const push = (text: string, heading?: number) => {
    // 段内的软换行/多空格折叠成单个空格 —— 裸 \n 若留到网格里会被当成一整格字符参与断行。
    // (段与段的边界由 marked 的块级 token 决定,这里折的是段**内部**的空白)
    const t = text.replace(/[ \t\r\n]+/g, ' ').trim();
    if (!t) return;
    paras.push({ index: paras.length, text: t, mdHeading: heading });
  };
  for (const tk of lexer(src)) blockToParas(tk, push);
  return paras;
}
