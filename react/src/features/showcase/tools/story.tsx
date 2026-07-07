import { FileText } from "lucide-react";
import { MarkdownView } from "@/features/knowledge";
import type { ToolDef } from "./types";

/** 图文故事卡:markdown 长文(渲染复用 knowledge 的 MarkdownView,XSS 由其 sanitize 白名单兜) */
export interface StoryContent extends Record<string, unknown> {
  markdown: string;
}

export const storyTool: ToolDef<StoryContent> = {
  type: "story",
  label: "图文故事",
  icon: FileText,
  order: 1,
  description: "写一段图文事迹(支持 markdown),讲人物故事、做法经验",
  makeDefault: () => ({ markdown: "" }),

  Editor: ({ value, onChange }) => (
    <div className="space-y-1">
      <textarea
        className="min-h-40 w-full rounded-md border border-input bg-background p-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-party-primary-20"
        value={value.markdown}
        placeholder={"讲讲这件事的来龙去脉…\n\n支持 markdown:# 标题、**加粗**、- 列表、图片等"}
        onChange={(e) => onChange({ ...value, markdown: e.target.value })}
      />
      <p className="text-xs text-muted-foreground">支持 markdown 语法;保存后按排版渲染</p>
    </div>
  ),

  Display: ({ value }) => (
    <div className="prose prose-sm max-w-none">
      <MarkdownView md={value.markdown} />
    </div>
  ),

  validate: (v) => (v.markdown.trim() ? null : "图文故事还没写内容"),
};
