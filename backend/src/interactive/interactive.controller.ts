import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { InteractiveService, type InteractiveActor } from './interactive.service';
import { RoomSessionService } from './room-session.service';
import { CreateEventDto, CreateGameDto } from './dto/create-event.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { RenameEventDto } from './dto/rename-event.dto';
import { CreateDesignDto, UpdateDesignDto } from './dto/design.dto';

/**
 * 现场互动后台配置台接口(需登录 + interactive:manage)。
 * 观众/大屏侧不走这里 —— 走 WebSocket 匿名入房(见 interactive.gateway)。
 */
@UseGuards(AuthGuard)
@Controller('interactive')
export class InteractiveController {
  constructor(
    private readonly interactive: InteractiveService,
    private readonly roomSession: RoomSessionService,
  ) {}

  private actor(me: AuthPayload, req: Request): InteractiveActor {
    return { sub: me.sub, name: me.name, ip: req.ip };
  }

  @Permission('interactive:manage')
  @Post('events')
  create(@Body() dto: CreateEventDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.interactive.createEvent(dto, this.actor(me, req));
  }

  @Permission('interactive:manage')
  @Get('events')
  list(@CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.interactive.listEvents(this.actor(me, req));
  }

  @Permission('interactive:manage')
  @Get('events/:id')
  get(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.interactive.getEvent(id, this.actor(me, req));
  }

  @Permission('interactive:manage')
  @Post('events/:id/end')
  end(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.interactive.endEvent(id, this.actor(me, req));
  }

  @Permission('interactive:manage')
  @Patch('events/:id')
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameEventDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const { roomCode, title } = await this.interactive.renameEvent(id, dto.title, this.actor(me, req));
    this.roomSession.renameRoom(roomCode, title); // 大屏/手机标题即时刷新
    return { ok: true, title };
  }

  @Permission('interactive:manage')
  @Delete('events/:id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    const { roomCode } = await this.interactive.deleteEvent(id, this.actor(me, req));
    this.roomSession.closeRoom(roomCode); // 通知在场端关闭 + 从内存移除运行态
    return { ok: true };
  }

  @Permission('interactive:manage')
  @Patch('events/:id/config')
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateConfigDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const { roomCode, config } = await this.interactive.updateConfig(id, dto.config, this.actor(me, req));
    this.roomSession.refreshConfig(roomCode, config); // 运行态即时刷新(背景/音乐/队色 live 生效)
    return { ok: true, config };
  }

  @Permission('interactive:manage')
  @Post('events/:id/games')
  async addGame(
    @Param('id') id: string,
    @Body() dto: CreateGameDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const { game, roomCode } = await this.interactive.addGame(id, dto, this.actor(me, req));
    await this.roomSession.refreshGames(roomCode); // 运行态节目单即时刷新(主持台 live)
    return game;
  }

  @Permission('interactive:manage')
  @Delete('games/:gameId')
  async removeGame(@Param('gameId') gameId: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    const { roomCode } = await this.interactive.removeGame(gameId, this.actor(me, req));
    await this.roomSession.refreshGames(roomCode);
    return { ok: true };
  }

  @Permission('interactive:manage')
  @Patch('games/:gameId')
  async updateGame(
    @Param('gameId') gameId: string,
    @Body() dto: UpdateGameDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const { game, roomCode } = await this.interactive.updateGame(gameId, dto, this.actor(me, req));
    await this.roomSession.refreshGames(roomCode); // 运行态即时刷新(音效恒即时;玩法/版式在非比赛中即时生效)
    return game;
  }

  // ── 自制游戏设计库(互动游戏编辑器;与运行房无关,不需 refreshGames 联动) ──

  @Permission('interactive:manage')
  @Get('designs')
  listDesigns() {
    return this.interactive.listDesigns();
  }

  @Permission('interactive:manage')
  @Post('designs')
  createDesign(@Body() dto: CreateDesignDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.interactive.createDesign(dto, this.actor(me, req));
  }

  @Permission('interactive:manage')
  @Get('designs/:id')
  getDesign(@Param('id') id: string) {
    return this.interactive.getDesign(id);
  }

  @Permission('interactive:manage')
  @Patch('designs/:id')
  updateDesign(
    @Param('id') id: string,
    @Body() dto: UpdateDesignDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.interactive.updateDesign(id, dto, this.actor(me, req));
  }

  @Permission('interactive:manage')
  @Delete('designs/:id')
  removeDesign(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.interactive.removeDesign(id, this.actor(me, req));
  }
}
