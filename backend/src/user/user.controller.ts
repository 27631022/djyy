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
import { Permission } from '../permission';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { AddMembershipDto } from './dto/add-membership.dto';
import { ReplaceRolesDto } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { ContactsQuery } from './dto/contacts.query';
import { LookupByEmpNoDto, LookupByNameDto } from './dto/lookup-by-empno.dto';

/**
 * 鉴权约定(2026-07-12 三级数据权限):
 *   - 读(list/stats/:id):登录即可,但服务端按登录人「可见范围」收敛
 *     (管理范围 ∪ 对口上级 ∪ 本单位兜底 —— 兜底保 AssignPicker/派发个人 tab 等业务选人组件);
 *   - directory / lookup-*:内部通讯录级轻量检索,登录即可、字段最小化(跨范围选人组件用);
 *   - 写:@Permission('admin:user:write') + service 按目标归属维度校验范围;
 *   - 角色分配:@Permission('admin:role:write')(仅系统管理员 —— 堵「任何登录用户可给自己提权」的洞)。
 */
@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  list(@Query() query: ListUsersQuery, @CurrentUser() me: AuthPayload) {
    return this.users.list(query, me.sub);
  }

  /**
   * 轻量用户检索(内部通讯录级):姓名/工号搜索,最小字段,登录即可。
   * 必须放在 `:id` 之前。
   */
  @Get('directory')
  directory(@Query('search') search?: string, @Query('take') take?: string) {
    const n = take ? parseInt(take, 10) : undefined;
    return this.users.directory(search, Number.isFinite(n) ? n : undefined);
  }

  /**
   * 通讯录(内部公司通讯录):登录即可、不做数据范围收敛,分页返回联系信息 + 部门/党组织/政治面貌过滤。
   * 必须放在 `:id` 之前,否则 'contacts' 会被识别成 id。
   */
  @Get('contacts')
  contacts(@Query() query: ContactsQuery) {
    return this.users.contacts(query);
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
  stats(@CurrentUser() me: AuthPayload) {
    return this.users.stats(me.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.users.findOneScoped(me.sub, id);
  }

  @Post()
  @Permission('admin:user:write')
  create(@Body() dto: CreateUserDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.users.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('admin:user:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Put(':id/memberships')
  @Permission('admin:user:write')
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
  @Permission('admin:user:write')
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
  @Permission('admin:user:write')
  removeMembership(
    @Param('id') id: string,
    @Param('orgId') orgId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.users.removeMembership(id, orgId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 角色分配 = 授权动作,仅 admin:role:write(内置只有 platform_admin)可操作 —— 防范围内管理员自我提权。 */
  @Put(':id/roles')
  @Permission('admin:role:write')
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
  @Permission('admin:user:write')
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
  @Permission('admin:user:write')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.users.softDelete(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
