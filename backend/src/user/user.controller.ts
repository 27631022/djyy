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
import { UserService } from './user.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { AddMembershipDto } from './dto/add-membership.dto';
import { ReplaceRolesDto } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { LookupByEmpNoDto, LookupByNameDto } from './dto/lookup-by-empno.dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  /**
   * 批量按员工编号查 User(V3 发证页 Step 3b 用)。
   *
   * 注意:必须放在 `:id` 之前,否则路由 'lookup-by-empno' 会被识别成 id。
   * 高频读、不写审计。
   */
  @Post('lookup-by-empno')
  lookupByEmpNo(@Body() dto: LookupByEmpNoDto) {
    return this.users.lookupByEmpNo(dto);
  }

  /**
   * 批量按姓名查 User(发证页:没填工号时用姓名兜底补工号+单位)。
   * 同样必须放在 `:id` 之前。返回「姓名 → 命中数组」,重名时数组 >1。
   */
  @Post('lookup-by-name')
  lookupByName(@Body() dto: LookupByNameDto) {
    return this.users.lookupByName(dto);
  }

  /**
   * 个人设置:更新本人资料。身份取自登录态(me.sub),字段白名单见 UpdateMyProfileDto ——
   * 不复用 PATCH /users/:id(那是管理向,收 name/active)。同样必须排在 `:id` 之前。
   */
  @Patch('me/profile')
  updateMyProfile(@Body() dto: UpdateMyProfileDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.users.selfUpdateProfile(me.sub, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /**
   * 统计:总数 / 在职数 / 行政机构未分配 / 党组织未加入(用户管理工具条角标)。
   * 必须放在 `:id` 之前,否则 'stats' 会被识别成 id。
   */
  @Get('stats')
  stats() {
    return this.users.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.users.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Put(':id/memberships')
  replaceMemberships(
    @Param('id') id: string,
    @Body() dto: ReplaceMembershipsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.replaceMemberships(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 新增单条组织归属(组织管理页「点机构加成员」)。 */
  @Post(':id/memberships')
  addMembership(
    @Param('id') id: string,
    @Body() dto: AddMembershipDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.addMembership(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 移除单条组织归属(把成员移出某机构)。 */
  @Delete(':id/memberships/:orgId')
  removeMembership(
    @Param('id') id: string,
    @Param('orgId') orgId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.removeMembership(id, orgId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Put(':id/roles')
  replaceRoles(
    @Param('id') id: string,
    @Body() dto: ReplaceRolesDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.replaceRoles(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /**
   * 整体替换自定义字段值。Body: { values: { [code]: stringValue } }
   * 未知字段会被静默丢弃,必填字段不能空,select 类型值必须是字典内合法 code。
   */
  @Put(':id/custom-fields')
  replaceCustomFields(
    @Param('id') id: string,
    @Body() body: { values: Record<string, string> },
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.replaceCustomFields(id, body?.values ?? {}, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.users.softDelete(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
