import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoleService } from './role.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';
import { AssignRoleUserDto } from './dto/assign-role-user.dto';
import { BatchAssignRoleUsersDto, BatchRemoveRoleUsersDto } from './dto/batch-role-users.dto';
import { ListRoleUsersQuery } from './dto/list-role-users.query';

@Controller('roles')
@UseGuards(AuthGuard)
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  /**
   * 角色列表 —— 读接口也要权限门(此前仅 AuthGuard,任何登录用户可拉全部角色+权限配置=越权)。
   * admin:role:read(角色管理)或 admin:user:read(用户管理页筛选器按角色 chip 过滤,需角色名)任一即可;
   * 普通成员两者皆无 → 403。
   */
  @Get()
  @Permission('admin:role:read', 'admin:user:read')
  list() {
    return this.roles.list();
  }

  /** 角色详情(含权限点配置)—— 仅角色管理场景,admin:role:read。 */
  @Get(':id')
  @Permission('admin:role:read')
  findOne(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  /** 角色成员列表(分页 + 姓名/员工编号搜索)—— member 角色 2 万+成员,禁止全量返回;成员名单敏感(如超管名单),admin:role:read。 */
  @Get(':id/users')
  @Permission('admin:role:read')
  listUsers(@Param('id') id: string, @Query() query: ListRoleUsersQuery) {
    return this.roles.listUsers(id, query);
  }

  /** 该角色全部成员 userId(轻量;批量添加面板算已持有重叠 / 单个添加去重用)。admin:role:read。 */
  @Get(':id/users/ids')
  @Permission('admin:role:read')
  listUserIds(@Param('id') id: string) {
    return this.roles.listUserIds(id);
  }

  /** 角色成员:直接添加/更新一名成员(授此角色 + 配数据范围)。授权动作 = admin:role:write。 */
  @Post(':id/users')
  @Permission('admin:role:write')
  addUser(
    @Param('id') id: string,
    @Body() dto: AssignRoleUserDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.addUser(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 角色成员:批量添加/更新(整批同一数据范围;幂等,已持有者覆盖更新范围)。 */
  @Post(':id/users/batch')
  @Permission('admin:role:write')
  batchAssignUsers(
    @Param('id') id: string,
    @Body() dto: BatchAssignRoleUsersDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.batchAssignUsers(id, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 角色成员:批量移除(幂等,未持有的忽略)。 */
  @Post(':id/users/batch-remove')
  @Permission('admin:role:write')
  batchRemoveUsers(
    @Param('id') id: string,
    @Body() dto: BatchRemoveRoleUsersDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.batchRemoveUsers(id, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 角色成员:解除某用户的此角色。 */
  @Delete(':id/users/:userId')
  @Permission('admin:role:write')
  removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.removeUser(id, userId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  // 角色/权限的写操作 = 授权配置,统一收口 admin:role:write(内置仅 platform_admin)——
  // 否则任何登录用户可给自己持有的角色加权限点变相提权(2026-07-12 三级数据权限一并堵上)。
  @Post()
  @Permission('admin:role:write')
  create(@Body() dto: CreateRoleDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.roles.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('admin:role:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('admin:role:write')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.roles.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Put(':id/permissions')
  @Permission('admin:role:write')
  replacePermissions(
    @Param('id') id: string,
    @Body() dto: ReplacePermissionsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.replacePermissions(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
