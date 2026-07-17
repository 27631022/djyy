import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { StorageService } from '../storage';
import {
  DocFormatInteractionService,
  FOLDER_FEEDBACK,
} from './doc-format-interaction.service';
import {
  CreateFeedbackDto,
  ListFeedbackQuery,
  ReplyFeedbackDto,
  SetFavoriteDto,
  ViewBeaconDto,
} from './dto/interaction.dto';

/** 失败样本的大小闸(与排版上传同口径:公文再大也就几 MB) */
const SAMPLE_MAX_BYTES = 30 * 1024 * 1024;

interface UploadedSample {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** multipart 中文文件名 latin1→utf8 还原(与 storage.controller 同款修复) */
function decodeName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

/**
 * 公文排版的互动:收藏 / 浏览 / 吐槽反馈。
 * 全部登录即可用(这是前台工具);只有「看全部反馈 / 回复 / 关闭」要 doc-format:manage,在 service 内判。
 */
@Controller('doc-format')
@UseGuards(AuthGuard)
export class DocFormatInteractionController {
  constructor(
    private readonly svc: DocFormatInteractionService,
    private readonly storage: StorageService,
  ) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  /** 页面显眼处的那几个数(转换量/浏览量/收藏数)+ 我的收藏状态 */
  @Get('stats')
  stats(@CurrentUser() me: AuthPayload) {
    return this.svc.stats(me.sub);
  }

  @Post('favorite')
  setFavorite(@Body() dto: SetFavoriteDto, @CurrentUser() me: AuthPayload) {
    return this.svc.setFavorite(me.sub, dto.on);
  }

  /** 进页面时打点,返回 viewLogId 供离开时 beacon 回填时长 */
  @Post('view')
  recordView(@CurrentUser() me: AuthPayload) {
    return this.svc.recordView(me.sub);
  }

  /**
   * 上传「转换失败的原始文件」作为反馈样本。
   * 单独一个口而不是把反馈改成 multipart —— 与 knowledge/showcase 的 FeedbackDialog 形状一致
   * (JSON 提交),用户先传文件拿 fileId 再带进来。
   */
  @Post('feedback/sample')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSample(
    @UploadedFile() file: UploadedSample | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    if (file.size > SAMPLE_MAX_BYTES) {
      throw new BadRequestException(`文件过大(${(file.size / 1024 / 1024).toFixed(1)}MB),最大 30MB`);
    }
    const stored = await this.storage.put(
      {
        buffer: file.buffer,
        originalName: decodeName(file.originalname),
        ownerModule: 'doc-format',
        folder: FOLDER_FEEDBACK,
      },
      this.ctx(me, req),
    );
    return { fileId: stored.id, fileName: stored.originalName };
  }

  @Post('feedback')
  addFeedback(@Body() dto: CreateFeedbackDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.addFeedback(dto, { ...this.ctx(me, req), actorId: me.sub, actorName: me.name });
  }

  /** scope=all 要 doc-format:manage(service 内判);scope=mine 看自己提的 */
  @Get('feedback')
  listFeedback(@Query() q: ListFeedbackQuery, @CurrentUser() me: AuthPayload) {
    return this.svc.listFeedback(me.sub, q.scope ?? 'mine', q.status);
  }

  @Post('feedback/:id/reply')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyFeedbackDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.replyFeedback(id, dto.content, {
      ...this.ctx(me, req),
      actorId: me.sub,
      actorName: me.name,
    });
  }

  @Post('feedback/:id/close')
  close(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.closeFeedback(id, { ...this.ctx(me, req), actorId: me.sub });
  }
}

/**
 * 浏览时长回填(**公开**)—— 离开页面时 navigator.sendBeacon 上报,带不了 auth 头故公开。
 * 只允许对已存在的 viewLog(cuid 不可枚举)更新时长、取 max、封顶 4h,攻击面可控。
 * (照 knowledge-public.controller 的同款设计)
 */
@Controller('public/doc-format')
export class DocFormatPublicController {
  constructor(private readonly svc: DocFormatInteractionService) {}

  @Post('view-beacon')
  viewBeacon(@Body() dto: ViewBeaconDto) {
    return this.svc.recordDuration(dto.viewLogId, dto.durationSec);
  }
}
