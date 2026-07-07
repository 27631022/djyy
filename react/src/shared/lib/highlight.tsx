import type { ReactNode } from "react";

/**
 * 片段里高亮首个命中词(大小写不敏感)。React 元素拼接,无 dangerouslySetInnerHTML。
 * 抽自知识门户联想下拉,全站搜索(首页联想/结果页)共用。
 */
export function highlightText(text: string, q: string): ReactNode {
  const kw = q.trim();
  if (!kw) return text;
  const idx = text.toLowerCase().indexOf(kw.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200/70 px-0.5 text-inherit">{text.slice(idx, idx + kw.length)}</mark>
      {text.slice(idx + kw.length)}
    </>
  );
}
