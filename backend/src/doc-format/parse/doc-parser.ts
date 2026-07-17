/**
 * .doc(OLE2 复合文档)解析:word-extractor 取纯文本。
 *
 * 为什么只取文本就够:排版功能的本质是「丢掉源格式、按规则重写」,所以源样式不是刚需。
 * 而且源样式还不可信 —— 实测 OA 产出的 .doc 全篇 100% 粗体(WPS 伪影、零信息)。
 * 真正会丢的是红头图片和版记表格,而它们按产品定案本就不在排版范围。
 *
 * ⚠ 已知会静默毁数据的坑:word-extractor 的 filterUnicode 默认 **true**,会把
 *    中文引号 “”(U+201C/201D) 换成 ASCII "、破折号 —(U+2014) 换成 -。
 *    页码规则「— 1 —」会被毁成「- 1 -」,且全文中文引号被 ASCII 化,肉眼极难发现。
 *    实测传 {filterUnicode:false} 后,273 字段落与 PDF 逐字符全等。
 *    → 本文件是全仓唯一调 word-extractor 的地方,在这里一次性钉死。
 */
import WordExtractor from 'word-extractor';
import type { RawParagraph } from '../recognize';

/** 绝不能省。见文件头注释 */
const NO_FILTER = { filterUnicode: false } as const;

export async function parseDoc(buf: Buffer): Promise<RawParagraph[]> {
  const doc = await new WordExtractor().extract(buf);
  const body = doc.getBody(NO_FILTER);
  return body.split('\n').map((text, index) => ({ index, text }));
}
