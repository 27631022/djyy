import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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

@Controller('roles')
@UseGuards(AuthGuard)
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  @Get(':id/users')
  listUsers(@Param('id') id: string) {
    return this.roles.listUsers(id);
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
