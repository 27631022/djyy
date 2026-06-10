// barrel —— 跨模块只从这里引;Module 导出放最后(加载顺序约定)。
export * from './exhibition.types';
export { ExhibitionService } from './exhibition.service';
export { ExhibitionModule } from './exhibition.module';
