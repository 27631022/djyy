import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { LayoutController } from './layout.controller';
import { LayoutService } from './layout.service';
import { VenueAiController } from './venue-ai.controller';
import { VenueAiService } from './venue-ai.service';
import { SeatingController } from './seating.controller';
import { SeatingService } from './seating.service';

/**
 * 会场管理模块。V1:会议室 + 会场图设计器 + 智能生成布局(AI 帮填走 ExternalApiModule)。
 * V2 会加 seating(选座方案 + 名单导入 + 智能选座);届时在此注册其 controller/service。
 * PrismaService / AuditService / ConfigService 为全局,无需 imports。
 */
@Module({
  imports: [ExternalApiModule],
  controllers: [RoomController, LayoutController, VenueAiController, SeatingController],
  providers: [RoomService, LayoutService, VenueAiService, SeatingService],
  exports: [RoomService, LayoutService],
})
export class VenueModule {}
