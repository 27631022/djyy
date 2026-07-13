import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DirectoryService } from './directory.service';
import { UserService } from './user.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { ReorderDirectoryDto, UpdateDirectoryMemberDto } from './dto/directory.dto';

/**
 * 通讯录接口。分两类:
 *   - 后台管理(scope/units/members):@Permission('directory:manage'),数据范围在 DirectoryService 内校验;
 *   - 个人向(my/*:收藏、对口关系):仅登录即可(无 @Permission),都作用于登录人自己。
 */
@Controller('directory')
@UseGuards(AuthGuard)
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly users: UserService,
  ) {}

  /* ─── 个人向(登录即可)─── */

  /** 我收藏的联系人 */
  @Get('my/favorites')
  myFavorites(@CurrentUser() me: AuthPayload) {
    return this.users.myFavorites(me.sub);
  }

  /** 收藏一个联系人 */
  @Post('my/favorites/:userId')
  addFavorite(@Param('userId') userId: string, @CurrentUser() me: AuthPayload) {
    return this.users.addFavorite(me.sub, userId);
  }

  /** 取消收藏 */
  @Delete('my/favorites/:userId')
  removeFavorite(@Param('userId') userId: string, @CurrentUser() me: AuthPayload) {
    return this.users.removeFavorite(me.sub, userId);
  }

  /** 本人部门的对口关系(对口上级机构 / 下级承接部门)—— 门户默认视图用 */
  @Get('my/counterpart-scope')
  counterpartScope(@CurrentUser() me: AuthPayload) {
    return this.users.counterpartScope(me.sub);
  }

  /* ─── 后台管理(directory:manage)─── */

  /** 我的管理范围:{ all, orgIds } —— 前端据此裁剪组织树只显可管单位 */
  @Get('scope')
  @Permission('directory:manage')
  scope(@CurrentUser() me: AuthPayload) {
    return this.directory.myScope(me.sub);
  }

  /** 某行政机构的直接成员(管理视图,含被隐藏的) */
  @Get('units/:orgId/members')
  @Permission('directory:manage')
  members(@Param('orgId') orgId: string, @Query('search') search: string | undefined, @CurrentUser() me: AuthPayload) {
    return this.directory.unitMembers(me.sub, orgId, search);
  }

  /** 按单位拖拽排序 */
  @Post('units/:orgId/reorder')
  @Permission('directory:manage')
  reorder(
    @Param('orgId') orgId: string,
    @Body() dto: ReorderDirectoryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.directory.reorder(me.sub, orgId, dto.userIds, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 改联系方式 / 隐藏显示 */
  @Patch('members/:userId')
  @Permission('directory:manage')
  update(
    @Param('userId') userId: string,
    @Body() dto: UpdateDirectoryMemberDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.directory.updateMember(me.sub, userId, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
