import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('permissions')
@UseGuards(AuthGuard)
export class PermissionController {
  constructor(private readonly perms: PermissionService) {}

  @Get()
  list() {
    return this.perms.list();
  }
}
