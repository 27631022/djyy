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
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { ReplaceRolesDto } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { LookupByEmpNoDto } from './dto/lookup-by-empno.dto';

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
