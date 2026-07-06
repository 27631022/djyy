import { useState } from "react";
import { XIcon } from "lucide-react";
import { Input } from "@/shared/components/ui/input";

/**
 * 标签 chips 编辑:输入后 回车/逗号 添加,点 × 删除。P4 的「AI 建议标签」也落到同一 value。
 */
export function TagsInput({
  value,
  onChange,
  max = 12,
  placeholder = "输入标签后回车",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  /** 用传入的原始串直接生成标签(不读闭包 draft,避免粘贴/rAF 时读到陈旧值) */
  function addTag(raw: string) {
    const t = raw.trim().replace(/[,，]/g, "");
    if (!t || value.includes(t) || value.length >= max) return;
    onChange([...value, t]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-white px-2 py-1.5 min-h-9">
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-party-soft text-[var(--party-primary)] text-xs"
        >
          #{t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="hover:opacity-70"
            aria-label={`删除标签 ${t}`}
          >
            <XIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          // 逗号(中/英)结尾即成一个标签 —— 当场用 v 生成,不经 rAF/闭包
          if (/[,，]$/.test(v)) {
            addTag(v);
            setDraft("");
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={(e) => {
          // 中文输入法组合(拼音候选)阶段的回车不提交 —— isComposing 守卫
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            addTag(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          addTag(draft);
          setDraft("");
        }}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-24 border-0 shadow-none focus-visible:ring-0 h-6 px-1 text-sm"
      />
    </div>
  );
}
