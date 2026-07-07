// 注意:Module 导出放最后(barrel 加载顺序约定)。
export type { SearchHit, SearchHitType, SearchGroup } from './search.service';
export { SearchService } from './search.service';
export { SearchModule } from './search.module';
