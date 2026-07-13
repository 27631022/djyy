import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DirectoryService } from './directory.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { ReorderDirectoryDto, UpdateDirectoryMemberDto } from './dto/directory.dto';

/**
 * 通讯录后台管理:排序 / 隐藏 / 改联系方式。
 * 全部 @Permission('directory:manage')(功能权限);数据范围在 DirectoryService 内按行政维校验
 * (通讯录管理员 scope=all 管所有;二级通讯录管理员 scope=custom/subtree 管所在二级单位及以下)。
 */
@Controller('directory')
@UseGuards(AuthGuard)
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

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
