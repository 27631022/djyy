import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let dbOk: boolean;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'djyy-platform',
      timestamp: new Date().toISOString(),
      checks: { database: dbOk ? 'up' : 'down' },
    };
  }
}
