import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { OrganizationModule } from './organization/organization.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { DictionaryModule } from './dictionary/dictionary.module';
import { UserCustomFieldModule } from './user-custom-field/user-custom-field.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // AuthModule 在业务模块之前注册,确保它们使用 AuthGuard 时已可用
    AuthModule,
    AuditModule,
    OrganizationModule,
    UserModule,
    RoleModule,
    PermissionModule,
    DictionaryModule,
    UserCustomFieldModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
