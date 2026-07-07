import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { Permission } from '../permission';
import { ShowcaseService } from './showcase.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { ReviewDto } from './dto/review.dto';

/** multipart 中文文件名 latin1→utf8 还原(同 storage.controller) */
function decodeMulterName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

interface UploadedResource {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * 先锋晒场(登录态)。
 * 读侧(分类/晒台/作品/榜单)登录即可;
 * 分类管理/晒台审核/下架 = showcase:manage;发起晒台 = showcase:publish;
 * **投稿参晒 = 登录即可**(人人晒实绩,审核是把关口);
 * 晒台编辑/关闭 = 台主或 manage、作品审核 = 台主或 manage(均 service 内判)。
 */
@Controller('showcase')
@UseGuards(AuthGuard)
export class ShowcaseController {
  constructor(private readonly svc: ShowcaseService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  /* ─── 晒场分类(六榜) ─── */

  @Get('categories')
  listCategories() {
    return this.svc.listCategories();
  }

  @Permission('showcase:manage')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createCategory(dto, this.ctx(me, req));
  }

  @Permission('showcase:manage')
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateCategory(id, dto, this.ctx(me, req));
  }

  @Permission('showcase:manage')
  @Post('categories/reorder')
  reorderCategories(@Body() dto: ReorderCategoriesDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.reorderCategories(dto.items, this.ctx(me, req));
  }

  @Permission('showcase:manage')
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeCategory(id, this.ctx(me, req));
  }

  /* ─── 我的参晒(跨晒台;注意放在 stages/:id 类路由之前无冲突,entries/mine 需先于 entries/:id) ─── */

  @Get('entries/mine')
  listMyEntries(@CurrentUser() me: AuthPayload) {
    return this.svc.listMyEntries(me.sub);
  }

  /** 跨台作品列表(管理员审核页) */
  @Permission('showcase:manage')
  @Get('entries')
  listAllEntries(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listAllEntries({
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /* ─── 晒台:读侧 ─── */

  @Get('stages')
  listStages(
    @CurrentUser() me: AuthPayload,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('mine') mine?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listStages(
      {
        q,
        categoryId,
        mine: mine === '1' || mine === 'true',
        status,
        sort: sort === 'hot' ? 'hot' : 'latest',
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      me.sub,
    );
  }

  @Get('stages/:id')
  getStage(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.getStage(id, me.sub);
  }

  @Get('stages/:id/ranking')
  getRanking(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.getRanking(id, me.sub);
  }

  /* ─── 晒台:写侧 ─── */

  @Permission('showcase:publish')
  @Post('stages')
  createStage(@Body() dto: CreateStageDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createStage(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch('stages/:id')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateStage(id, dto, this.ctx(me, req));
  }

  @Post('stages/:id/submit')
  submitStage(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.submitStage(id, this.ctx(me, req));
  }

  @Permission('showcase:manage')
  @Post('stages/:id/review')
  reviewStage(
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.reviewStage(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post('stages/:id/close')
  closeStage(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.closeStage(id, this.ctx(me, req));
  }

  @Post('stages/:id/reopen')
  reopenStage(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.reopenStage(id, this.ctx(me, req));
  }

  @Permission('showcase:manage')
  @Post('stages/:id/unpublish')
  unpublishStage(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.unpublishStage(id, this.ctx(me, req));
  }

  @Delete('stages/:id')
  removeStage(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeStage(id, this.ctx(me, req));
  }

  /* ─── 参晒作品 ─── */

  @Get('stages/:id/entries')
  listEntries(
    @Param('id') stageId: string,
    @CurrentUser() me: AuthPayload,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listEntries(
      stageId,
      {
        status,
        sort: sort === 'rank' ? 'rank' : 'latest',
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      me.sub,
    );
  }

  /** 投稿:登录即可(「人人争先进、个个晒实绩」;台主/管理员审核把关) */
  @Post('stages/:id/entries')
  createEntry(
    @Param('id') stageId: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createEntry(stageId, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Get('entries/:id')
  getEntry(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.getEntry(id, me.sub);
  }

  @Patch('entries/:id')
  updateEntry(
    @Param('id') id: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateEntry(id, dto, this.ctx(me, req));
  }

  @Post('entries/:id/submit')
  submitEntry(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.submitEntry(id, this.ctx(me, req));
  }

  /** 审核作品:台主或管理员(service 内判,无 @Permission 装饰器 —— 台主不一定有 manage) */
  @Post('entries/:id/review')
  reviewEntry(
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.reviewEntry(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete('entries/:id')
  removeEntry(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeEntry(id, this.ctx(me, req));
  }

  /* ─── 资源上传(规范命名「标题-序号」,集中 stage-<id> / entry-<id> 文件夹) ─── */

  @Post('stages/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadStageFile(
    @Param('id') id: string,
    @UploadedFile() file: UploadedResource | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    return this.svc.uploadStageFile(
      id,
      { originalName: decodeMulterName(file.originalname), mimeType: file.mimetype, buffer: file.buffer },
      this.ctx(me, req),
    );
  }

  @Post('entries/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadEntryFile(
    @Param('id') id: string,
    @UploadedFile() file: UploadedResource | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    return this.svc.uploadEntryFile(
      id,
      { originalName: decodeMulterName(file.originalname), mimeType: file.mimetype, buffer: file.buffer },
      this.ctx(me, req),
    );
  }
}
