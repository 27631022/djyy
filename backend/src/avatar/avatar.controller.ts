import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { RoleService } from '../role';
import { StorageService } from '../storage';
import { AvatarService } from './avatar.service';
import { AvatarLibraryService } from './avatar-library.service';
import { GenerateAvatarDto } from './dto/generate-avatar.dto';
import {
  AddLibraryItemDto,
  UpdateLibraryItemDto,
  PromoteFromFileDto,
} from './dto/avatar-library.dto';

/**
 * 头像 AI 生成 + 历史/生成头像(鉴权)。
 *   POST   /avatars/generate         仅登录  { photoFileId, prompt? } → 生成 → 预览 { fileId, url }
 *   GET    /avatars/history          仅登录  本人历史;查他人需 avatar:manage(否则返回空)
 *   DELETE /avatars/history/:fileId  仅登录  删本人历史头像;删他人的需 avatar:manage;在用拒删
 *   GET    /avatars/generated        avatar:manage  全员生成头像总览(私有头像库汇总)
 * 生成不直接改用户头像 —— 前端预览确认后再走 users.update 设 avatarUrl。
 */
@Controller('avatars')
@UseGuards(AuthGuard)
export class AvatarController {
  constructor(
    private readonly svc: AvatarService,
    private readonly roles: RoleService,
  ) {}

  @Post('generate')
  async generate(
    @Body() dto: GenerateAvatarDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.generate(
      dto.photoFileId,
      { actorId: me.sub, actorName: me.name, ip: req.ip },
      { prompt: dto.prompt, targetName: dto.targetName, employeeNumber: dto.employeeNumber },
    );
  }

  /**
   * 某用户的历史 AI 头像(私有,供「从历史头像库挑选」)。
   * **收敛越权**:默认查本人(用登录态的工号/姓名,忽略客户端伪造);查他人(传入 employeeNumber ≠ 本人工号)
   * 需 avatar:manage,无权限返回空数组(degrade —— 后台管理员即便没 avatar:manage 仍能生成新头像,只是不显他人历史)。
   */
  @Get('history')
  async history(
    @CurrentUser() me: AuthPayload,
    @Query('name') name?: string,
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    const self = !employeeNumber || employeeNumber === me.username;
    if (self) return this.svc.listHistory({ name: me.name, employeeNumber: me.username });
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      me.sub,
      'avatar:manage',
    );
    if (!(isPlatformAdmin || entries.length)) return [];
    return this.svc.listHistory({ name, employeeNumber });
  }

  /**
   * 删除历史头像库文件(本人删自己文件夹的;有 avatar:manage 可删任何人的)。
   * 正在被使用(当前头像/互动引用)→ 409 提示先更换;联动清派生弹出抠像。
   */
  @Delete('history/:fileId')
  async removeHistory(
    @Param('fileId') fileId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      me.sub,
      'avatar:manage',
    );
    return this.svc.removeHistory(
      fileId,
      { actorId: me.sub, actorName: me.name, ip: req.ip },
      { name: me.name, username: me.username, canManage: isPlatformAdmin || entries.length > 0 },
    );
  }

  /** 管理员总览:所有员工生成的头像(私有头像汇总,供浏览 + 提升到公共库)。 */
  @Get('generated')
  @Permission('avatar:manage')
  generated() {
    return this.svc.listGenerated();
  }
}

/**
 * 公共头像库(全平台共享)。
 *   GET    /avatars/library                 仅登录(个人设置挑头像等消费场景也要看)
 *   GET    /avatars/library/no-avatar-count  avatar:manage  无头像用户数(分配默认前展示规模)
 *   POST   /avatars/library/apply-defaults   avatar:manage  为无头像用户按性别随机分配默认头像
 *   POST   /avatars/library/from-file        avatar:manage  { sourceFileId, name?, gender? } 员工私有头像提升进库
 *   POST   /avatars/library                  avatar:manage  { fileId, name?, gender? } 上传件入库
 *   PATCH  /avatars/library/:id              avatar:manage  { name?, gender? }
 *   DELETE /avatars/library/:id              avatar:manage  联动软删原图+缩略图
 * ⚠ 静态子路径(no-avatar-count/apply-defaults/from-file)须在 GET/POST 的 :id 前声明,否则被当 id 匹配。
 */
@Controller('avatars/library')
@UseGuards(AuthGuard)
export class AvatarLibraryController {
  constructor(private readonly svc: AvatarLibraryService) {}

  @Get()
  list(@Query('q') q?: string, @Query('gender') gender?: string) {
    return this.svc.list({ q, gender });
  }

  /** 无头像 active 用户数(「分配默认头像」确认框展示)。静态路径,须在 GET :id 之前。 */
  @Get('no-avatar-count')
  @Permission('avatar:manage')
  noAvatarCount() {
    return this.svc.noAvatarCount();
  }

  /** 为所有无头像用户按性别随机分配默认头像(幂等:只动仍无头像的)。 */
  @Post('apply-defaults')
  @Permission('avatar:manage')
  applyDefaults(@CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.applyDefaults({ actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 把员工私有头像提升进公共库(复制字节 → 新 fileId,与员工原图解耦)。 */
  @Post('from-file')
  @Permission('avatar:manage')
  fromFile(
    @Body() dto: PromoteFromFileDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.promoteFromFile(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 详情(含 configJson)—— 头像编辑器「回灌再编辑」取配置。 */
  @Get(':id')
  @Permission('avatar:manage')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  @Permission('avatar:manage')
  add(@Body() dto: AddLibraryItemDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.add(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('avatar:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLibraryItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('avatar:manage')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}

/**
 * 公开头像口(**免登录、持久**)—— 头像本就是公开展示资源(列表/挂件/前台都要 <img> 直显)。
 *   GET /public/avatars/:id      → 流式头像图片
 *   GET /public/avatars/:id/pop  → 该头像(原图 fileId)的「弹出人物」透明抠像;
 *                                   非库头像/背景不适合抠像 → 404,前端回退圈内放大效果
 * 安全:只放行 storage 里 ownerModule=user 且文件夹含 avatars 的图片,不当通用公开下载口用(降攻击面)。
 */
@Controller('public/avatars')
export class PublicAvatarController {
  constructor(
    private readonly storage: StorageService,
    private readonly library: AvatarLibraryService,
  ) {}

  @Get(':id')
  async serve(@Param('id') id: string): Promise<StreamableFile> {
    const meta = await this.storage.getMeta(id); // 不存在/软删 → NotFound
    if (meta.ownerModule !== 'user' || !(meta.folder ?? '').includes('avatars')) {
      throw new NotFoundException('不是头像文件');
    }
    const { stream } = await this.storage.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }

  @Get(':id/pop')
  async servePop(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const popId = await this.library.popFileIdOf(id);
    if (!popId) throw new NotFoundException('该头像没有弹出抠像');
    // 短缓存(5 分钟):够前端 fetch 探测预热后 <img> 零流量复用;不能放长 —— 抠像算法升级会
    // 原地重生成(URL 以原图 id 为键不变),放一天会让用户浏览器 24h 内一直看旧抠像
    res.setHeader('Cache-Control', 'public, max-age=300');
    return this.serve(popId);
  }
}
