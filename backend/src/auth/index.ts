// 注意:Module 导出必须放最后!
// 原因:Module 触发 controller 加载,controller 可能间接 import 本 barrel,
// 此时若 Module 在 barrel 顶部,AuthGuard 等 primitives 还没 export,
// 会导致 @UseGuards(AuthGuard) 拿到 undefined 而抛 InvalidDecoratorItemException。
export { AuthGuard } from './auth.guard';
export { CurrentUser } from './current-user.decorator';
export { AuthService } from './auth.service';
export type { AuthPayload } from './auth.service';
export { AuthModule } from './auth.module';
