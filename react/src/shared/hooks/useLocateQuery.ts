import { useEffect, type RefObject } from "react";

/** 金黄闪烁一次(.kb-search-hit 动画定义在 index.css,全站搜索定位共用)。 */
export function flashHighlight(el: HTMLElement) {
  el.classList.add("kb-search-hit");
  window.setTimeout(() => el.classList.remove("kb-search-hit"), 2600);
}

/** 在 root 里找首个文本命中 q 的块级元素(TreeWalker,大小写不敏感)。 */
export function locateTextInRoot(root: HTMLElement, q: string): HTMLElement | null {
  const ql = q.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if ((node.textContent ?? "").toLowerCase().includes(ql)) {
      return (node.parentElement?.closest(
        "p,li,td,th,h1,h2,h3,h4,h5,h6,blockquote,pre",
      ) ?? node.parentElement) as HTMLElement | null;
    }
  }
  return null;
}

/**
 * 从搜索结果带 ?q= 进详情页:在 ref 容器内定位首个命中行,滚动居中 + 金黄闪烁。
 * 纯 DOM 操作不注入节点、不动 React 树(抽自知识阅读页)。
 * q 传空串则不定位(如 ?faq= 深链优先时);contentKey 传内容标识(文章/作品 id),换内容后重定位。
 *
 * ⚠ 首帧 ref 未必已挂载、markdown/图片正文常渐进渲染 → 单次 rAF 会「太早找不到就放弃」(挂载定位失效)。
 * 故短时重试:每 ~100ms 试一次、命中即停,最多 ~2s,覆盖挂载时序 + 正文深处命中。
 */
export function useLocateQuery(
  ref: RefObject<HTMLElement | null>,
  q: string,
  contentKey?: string,
) {
  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    let raf = 0;
    let timer = 0;
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      const root = ref.current;
      const el = root ? locateTextInRoot(root, q) : null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        flashHighlight(el);
        return;
      }
      if (++tries < 20) timer = window.setTimeout(attempt, 100);
    };
    raf = requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [ref, q, contentKey]);
}
