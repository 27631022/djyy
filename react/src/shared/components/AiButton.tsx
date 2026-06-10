import { SparklesIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

/**
 * AI 功能按钮 —— 全站统一规范。
 *
 * 约定:一切「和 AI 有关」的操作按钮(AI 识别 / AI 帮填 / 智能生成…)都用本组件,
 * 统一**紫色(#7C3AED)+ ✨ SparklesIcon**,与品牌红(--party-primary)区分、醒目。
 * 紫色是**语义色**(像金/银/铜奖牌),不跟主题色变。
 *
 * padding / text-size / flex 等通过 className 传入;其余 button 属性(onClick/disabled/
 * title…)直接透传。需要隐藏图标时传 icon={false}。
 */
const AI_ACCENT = "#7C3AED";

export function AiButton({
  children,
  className = "",
  icon = true,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors hover:bg-[#F5F3FF] disabled:opacity-60 disabled:hover:bg-transparent ${className}`}
      style={{ borderColor: AI_ACCENT, color: AI_ACCENT }}
    >
      {icon && <SparklesIcon className="w-4 h-4 flex-shrink-0" />}
      {children}
    </button>
  );
}
