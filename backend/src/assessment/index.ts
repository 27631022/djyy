// 考核系统 barrel。Module 放最后(barrel 加载顺序约定)。
export { AssessmentService } from './assessment.service';
export type { IndicatorNode, IndicatorKind } from './indicator-tree';
export type { ScoreInput, ScoreCtx } from './scoring-strategies';
export type { DataSourceOutput, DataSourceCollection } from './data-sources';
export { AssessmentModule } from './assessment.module';
