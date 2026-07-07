import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge';
import { ShowcaseModule } from '../showcase';
import { CertificateModule } from '../certificate';
import { NavCategoryModule } from '../nav-category';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * 全站搜索 —— 位于 knowledge / showcase / certificate / nav-category 之上(聚合各自的搜索方法)。
 * 无人依赖本模块 → 依赖图仍是 DAG(照 maintenance 范式;编排放这里避免内容模块互相成环)。
 */
@Module({
  imports: [KnowledgeModule, ShowcaseModule, CertificateModule, NavCategoryModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
