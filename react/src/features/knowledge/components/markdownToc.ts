/** 标题文字 → 基础锚点 id。同名标题的去重后缀由 dedupeId 统一追加。 */
export function headingId(text: string): string {
  return `h-${text.trim().replace(/\s+/g, "-").slice(0, 64)}`;
}

/**
 * 去重器:同一渲染/提取过程内,重复基础 id 追加 -2/-3…。
 * TOC 提取端与 Markdown 渲染端各建一个新实例,按同一顺序(文档标题先后)调用,
 * 保证两端为同一标题生成完全一致的 id(否则 TOC 锚点会跳错/死链)。
 */
export function makeDeduper(): (baseId: string) => string {
  const seen = new Map<string, number>();
  return (baseId: string) => {
    const n = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, n);
    return n === 1 ? baseId : `${baseId}-${n}`;
  };
}

/** 把标题里的行内 markdown 语法归一成纯文本(链接取文字、图片取 alt、去强调符号)——
 *  与渲染端 textOf(取 DOM 文本)保持同一结果,两端 id 才能对齐。 */
export function plainHeadingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // ![alt](url) → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/[*_`~]/g, "")
    .trim();
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

/** 从 markdown 源提取 h1~h3 目录(跳过代码块内的 #;去重 + 剥行内语法与渲染端对齐) */
export function extractToc(md: string): TocItem[] {
  const items: TocItem[] = [];
  const dedupe = makeDeduper();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = plainHeadingText(m[2]);
      if (text) items.push({ id: dedupe(headingId(text)), text, level: m[1].length });
    }
  }
  return items;
}
