// 公文排版模块 barrel。注意:Module 导出放最后(barrel 加载顺序约定)。
export { DocFormatService } from './doc-format.service';
export type { TemplateView, AnalyzeResult } from './doc-format.service';
export { BUILTIN_PRESETS, BUILTIN_PRESET_MAP, DEFAULT_PRESET_KEY, SIZE_PT } from './presets';
export type { BuiltinPreset } from './presets';
export { normalizeConfig } from './config';
export { metricsOf, layoutParagraph, findOrphans, paginate, mmToPt, mmToTwips } from './grid';
export { recognize, cleanText } from './recognize';
export type { RawParagraph } from './recognize';
export { renderDocx, buildDocument } from './render/docx-renderer';
export {
  ELEMENT_TYPES,
  ELEMENT_TYPE_LABEL,
  FONT_ROLES,
  FONT_ROLE_LABEL,
} from './types';
export type {
  Align,
  ArticleRule,
  DocElement,
  DocFormatConfig,
  DocRun,
  ElementStyle,
  ElementType,
  FontRole,
  OrphanWarning,
  PageMetrics,
  PageNumberConfig,
} from './types';
export { DocFormatModule } from './doc-format.module';
