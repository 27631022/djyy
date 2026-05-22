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
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPayload } from '../auth/auth.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';

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

  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.roles.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.roles.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Put(':id/permissions')
  replacePermissions(
    @Param('id') id: string,
    @Body() dto: ReplacePermissionsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.roles.replacePermissions(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
