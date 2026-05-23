import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma';
import { HealthModule } from './health';
import { OrganizationModule } from './organization';
import { AuthModule } from './auth';
import { AuditModule } from './audit';
import { UserModule } from './user';
import { RoleModule } from './role';
import { PermissionModule } from './permission';
import { DictionaryModule } from './dictionary';
import { UserCustomFieldModule } from './user-custom-field';
import { SiteSettingModule } from './site-setting';
import { NavCategoryModule } from './nav-category';
import { CertificateModule } from './certificate';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    CertificateModule,
  ],
})
export class AppModule {}
