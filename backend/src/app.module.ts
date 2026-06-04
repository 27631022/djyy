import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma';
import { HealthModule } from './health';
import { OrganizationModule } from './organization';
import { AuthModule } from './auth';
import { AuditModule } from './audit';
import { UserModule } from './user';
import { RoleModule } from './role';
import { PermissionModule, PermissionGuard } from './permission';
import { DictionaryModule } from './dictionary';
import { UserCustomFieldModule } from './user-custom-field';
import { SiteSettingModule } from './site-setting';
import { NavCategoryModule } from './nav-category';
import { ExternalApiModule } from './external-api';
import { StorageModule } from './storage';
import { IconModule } from './icon';
import { CertificateModule } from './certificate';
import { TaskModule } from './task';
import { MaintenanceModule } from './maintenance';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // 定时任务底座(@Cron / @Interval / @Timeout)
    PrismaModule,
    // AuthModule 在业务模块之前注册,确保它们使用 AuthGuard 时已可用
    AuthModule,
    AuditModule,
    HealthModule,
    OrganizationModule,
    UserModule,
    RoleModule,
    PermissionModule,
    DictionaryModule,
    UserCustomFieldModule,
    SiteSettingModule,
    NavCategoryModule,
    ExternalApiModule,
    StorageModule,
    IconModule,
    CertificateModule,
    TaskModule,
    MaintenanceModule,
  ],
  providers: [
    // 全局权限守卫:仅 @Permission() 装饰的接口实际校验,其他不影响
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
