// 头像模块 barrel(AI 生成 + 公共头像库)。注意:Module 导出放最后(barrel 加载顺序约定)。
export { AvatarService } from './avatar.service';
export type { AvatarGenerateResult } from './avatar.service';
export { AvatarLibraryService } from './avatar-library.service';
export { AvatarModule } from './avatar.module';
