import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全量列出权限点,前端可按 category 自行分组 */
  async list() {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }
}
