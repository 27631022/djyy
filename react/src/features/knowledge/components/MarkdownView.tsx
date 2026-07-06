import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { apiOrigin } from "@/shared/api/client";
import { headingId, makeDeduper } from "./markdownToc";

/**
 * XSS 唯一闸门:rehype-raw 打开了 raw HTML(存量 docsify md 里有 <video>/<img>),
 * 必须由 sanitize 白名单兜底 —— 只放行 video/source 及安全属性,script/iframe/事件属性全被剥。
 */
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "video", "source"],
  attributes: {
    ...defaultSchema.attributes,
    video: ["src", "poster", "controls", "preload", "width", "height", "muted", "loop", "playsInline"],
    source: ["src", "type"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "loading"],
  },
};

/** markdown 里存相对路径(/api/…),渲染时拼后端 origin(治局域网 IP 变动) */
function resolveSrc(src?: string): string | undefined {
  if (src && src.startsWith("/api/")) return `${apiOrigin}${src}`;
  return src;
}

/** 提醒框语法归一:docsify `?>`/`!>` + GitHub `> [!NOTE]` → 带 emoji 标签的引用块(再由 blockquote 上色) */
const GH_ALERT: Record<string, string> = {
  NOTE: "📌 **说明**",
  TIP: "💡 **提示**",
  IMPORTANT: "❗ **重要**",
  WARNING: "⚠️ **警告**",
  CAUTION: "🚫 **注意**",
};
function expandCallouts(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      let m = /^\?>\s?(.*)$/.exec(line);
      if (m) return `> 💡 **提示** ${m[1]}`.trimEnd();
      m = /^!>\s?(.*)$/.exec(line);
      if (m) return `> ⚠️ **注意** ${m[1]}`.trimEnd();
      m = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(line);
      if (m) return `> ${GH_ALERT[m[1].toUpperCase()]} ${m[2]}`.trimEnd();
      return line;
    })
    .join("\n");
}

/** 按引用块首个 emoji 判定提醒框类型 → 配色 */
function calloutClass(text: string): string {
  const t = text.trimStart();
  if (t.startsWith("💡")) return "border-emerald-400 bg-emerald-50/60";
  if (t.startsWith("⚠️")) return "border-amber-400 bg-amber-50/60";
  if (t.startsWith("❗") || t.startsWith("🚫")) return "border-red-400 bg-red-50/60";
  if (t.startsWith("📌")) return "border-blue-400 bg-blue-50/60";
  return "border-[var(--party-primary)] bg-party-soft";
}

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

/**
 * 知识文章 Markdown 渲染(GFM 表格 + 受控 raw HTML)。
 * 标题带锚点 id(供右侧 TOC 跳转);图片懒加载;/api/ 相对引用自动拼 origin。
 */
export function MarkdownView({ md, className = "" }: { md: string; className?: string }) {
  // 每次渲染新建去重器,按标题出现顺序追加 -2/-3…,与 extractToc 的去重完全对齐(TOC 锚点不跳错)
  const dedupe = makeDeduper();
  const anchorId = (children: React.ReactNode) => dedupe(headingId(textOf(children)));
  return (
    <div className={`text-[15px] leading-7 text-gray-800 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]}
        components={{
          h1: ({ children }) => (
            <h1 id={anchorId(children)} className="text-2xl font-bold mt-8 mb-4 pb-2 border-b border-gray-200 scroll-mt-24">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 id={anchorId(children)} className="text-xl font-bold mt-7 mb-3 scroll-mt-24">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 id={anchorId(children)} className="text-lg font-semibold mt-6 mb-2 scroll-mt-24">
              {children}
            </h3>
          ),
          h4: ({ children }) => <h4 className="text-base font-semibold mt-5 mb-2">{children}</h4>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          ul: ({ children }) => <ul className="my-3 pl-6 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 pl-6 list-decimal space-y-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className={`my-4 border-l-4 px-4 py-2 text-gray-700 rounded-r ${calloutClass(textOf(children))}`}>
              {children}
            </blockquote>
          ),
          code: ({ children, className: cls }) =>
            cls ? (
              <code className={`${cls} block`}>{children}</code>
            ) : (
              <code className="px-1.5 py-0.5 rounded bg-gray-100 text-[13px] text-rose-600">{children}</code>
            ),
          pre: ({ children }) => (
            <pre className="my-4 p-4 rounded-lg bg-gray-900 text-gray-100 text-[13px] leading-6 overflow-x-auto">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border border-gray-200 px-3 py-2 align-top">{children}</td>,
          a: ({ href, children }) => (
            <a
              href={resolveSrc(href)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--party-primary)] underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={resolveSrc(typeof src === "string" ? src : undefined)}
              alt={alt ?? ""}
              loading="lazy"
              className="my-4 max-w-full rounded-lg border border-gray-100 shadow-sm"
            />
          ),
          video: ({ src, poster, children }) => (
            <video
              src={resolveSrc(typeof src === "string" ? src : undefined)}
              poster={resolveSrc(typeof poster === "string" ? poster : undefined)}
              controls
              preload="metadata"
              className="my-4 w-full max-h-[480px] rounded-lg bg-black"
            >
              {children}
            </video>
          ),
          source: ({ src, type }) => (
            <source src={resolveSrc(typeof src === "string" ? src : undefined)} type={type} />
          ),
          hr: () => <hr className="my-6 border-gray-200" />,
        }}
      >
        {expandCallouts(md)}
      </ReactMarkdown>
    </div>
  );
}
