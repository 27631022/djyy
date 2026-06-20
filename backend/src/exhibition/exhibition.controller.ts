import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { ExhibitionService } from './exhibition.service';
import { ExhibitionAiService } from './exhibition-ai.service';
import { ExhibitionNarrationService } from './exhibition-narration.service';
import { CreateHallDto, UpdateHallDto } from './dto/hall.dto';
import { GenerateHallDto } from './dto/generate-hall.dto';
import { NarrateDto } from './dto/narrate.dto';

/**
 * 展厅 CRUD(规格 5.5)。
 *   GET  /halls         公开  展厅目录
 *   GET  /halls/:id     公开  单厅「已解析」JSON(客户端漫游用)
 *   POST/PATCH/DELETE   @Permission('exhibition:manage')  布展管理
 *
 * GET 公开(免登录「开网址即进」);写操作走全局 PermissionGuard 校验。
 */
@Controller('halls')
export class ExhibitionController {
  constructor(
    private readonly svc: ExhibitionService,
    private readonly ai: ExhibitionAiService,
    private readonly narration: ExhibitionNarrationService,
  ) {}

  @Get()
  list() {
    return this.svc.list();
  }

  /** 解说员配音:解说词文本 → AI 合成音频 → 存 storage,返回 fileId + url(前端写进 fixture.narration) */
  @Post('narration/tts')
  @UseGuards(AuthGuard)
  @Permission('exhibition:manage')
  async narrate(
    @Body() dto: NarrateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    // 本地 IndexTTS2 声音克隆要参考音频 —— 取该厅解说员设置里的「音色参考音频」(没有则用示例音色)
    let voiceRefFileId: string | undefined;
    if (dto.hallId) {
      try {
        const hall = await this.svc.getResolved(dto.hallId);
        voiceRefFileId = hall.meta?.guide?.voiceRefFileId;
      } catch {
        /* 厅不存在/未保存,忽略 */
      }
    }
    return this.narration.synthesize(
      { text: dto.text, voice: dto.voice, hallId: dto.hallId, voiceRefFileId },
      { actorId: me.sub, actorName: me.name, ip: req.ip },
    );
  }

  /** AI 生成展厅布置(不落库,前端应用进搭建器后由用户确认保存) */
  @Post('ai-generate')
  @UseGuards(AuthGuard)
  @Permission('exhibition:manage')
  aiGenerate(
    @Body() dto: GenerateHallDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.ai.generate(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getResolved(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @Permission('exhibition:manage')
  create(
    @Body() dto: CreateHallDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Permission('exhibition:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHallDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @Permission('exhibition:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}

/** 可用连接器列表(供 P2 管理端给组件绑定数据来源)。仅登录。 */
@Controller('connectors')
export class ConnectorController {
  constructor(private readonly svc: ExhibitionService) {}

  @Get()
  @UseGuards(AuthGuard)
  list() {
    return this.svc.listConnectors();
  }
}
