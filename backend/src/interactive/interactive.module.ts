import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { AuditModule } from '../audit';
import { AuthModule } from '../auth';
import { RoleModule } from '../role';
import { StorageModule } from '../storage';
import { UserModule } from '../user';
import { AvatarModule } from '../avatar';
import { InteractiveService } from './interactive.service';
import { RoomSessionService } from './room-session.service';
import { InteractiveGateway } from './interactive.gateway';
import { InteractiveController } from './interactive.controller';
import { PublicInteractiveController } from './public-interactive.controller';

/**
 * 现场互动(大屏 + 手机扫码遥控)—— 实时基座(第 0 期)。
 * socket.io 网关(复用 3001 端口)+ 内存房间态 + 活动/游戏/局数据模型 + 双端游戏注册表。
 * AuthModule 供网关 handleConnection 校验 host 令牌;RoleModule 供 service 判 platform_admin;
 * UserModule 供公开口「工牌进场」按工号/姓名精确匹配员工。
 */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, RoleModule, StorageModule, UserModule, AvatarModule],
  controllers: [InteractiveController, PublicInteractiveController],
  providers: [InteractiveService, RoomSessionService, InteractiveGateway],
  exports: [InteractiveService],
})
export class InteractiveModule {}
