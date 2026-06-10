import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { SeatingService } from './seating.service';
import { CreateSeatingPlanDto } from './dto/create-seating-plan.dto';
import { UpdateSeatingPlanDto } from './dto/update-seating-plan.dto';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * 选座方案(排座)。V2.1 落地名单导入;分区/排座 V2.2-V2.3。
 *   GET   /venue/seating-plans?layoutId=        登录    列表
 *   GET   /venue/seating-plans/:id              登录    详情(含名单)
 *   POST  /venue/seating-plans                  manage  新建(绑 layout)
 *   PATCH /venue/seating-plans/:id              manage  改名/日期/状态/名单
 *   DELETE /venue/seating-plans/:id             manage  删除
 *   POST  /venue/seating-plans/:id/import-roster manage 导入名单(xlsx/csv)
 */
@Controller('venue/seating-plans')
@UseGuards(AuthGuard)
export class SeatingController {
  constructor(private readonly svc: SeatingService) {}

  @Get()
  list(@Query('layoutId') layoutId?: string) {
    return this.svc.list(layoutId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Permission('venue:manage')
  create(@Body() dto: CreateSeatingPlanDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('venue:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSeatingPlanDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('venue:manage')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post(':id/import-roster')
  @Permission('venue:manage')
  @UseInterceptors(FileInterceptor('file'))
  importRoster(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.importRoster(id, file, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post(':id/save-assignments')
  @Permission('venue:manage')
  saveAssignments(
    @Param('id') id: string,
    @Body() body: { assignments?: unknown[] },
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.saveAssignments(id, body.assignments ?? [], {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /**
   * 导出 Excel:type=arrangement 座位安排表 / type=signin 签到表。
   * 仅登录(同 GET 详情);八位字节流不带 Content-Disposition(前端 axios blob 自行命名,
   * 规避 HTTP 局域网下载管理器拦截,同证书/任务下载口)。
   */
  @Get(':id/export')
  async exportFile(
    @Param('id') id: string,
    @Query('type') type: string,
  ): Promise<StreamableFile> {
    const buf = await this.svc.exportXlsx(id, type === 'signin' ? 'signin' : 'arrangement');
    return new StreamableFile(buf, { type: 'application/octet-stream' });
  }
}
