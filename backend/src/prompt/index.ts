// AI 提示词模块 barrel。注意:Module 导出放最后(barrel 加载顺序约定)。
export { PromptService } from './prompt.service';
export type { PromptView } from './prompt.service';
export { AI_PROMPTS, AI_PROMPT_MAP } from './ai-prompts';
export type { AiPromptDef, AiPromptKey } from './ai-prompts';
export { PromptModule } from './prompt.module';
