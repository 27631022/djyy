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
import { KnowledgeService } from './knowledge.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { CreateTypeDto, UpdateTypeDto } from './dto/create-type.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ReviewArticleDto } from './dto/review-article.dto';
import { AddAttachmentDto } from './dto/add-attachment.dto';

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
 * 知识分享平台(登录态)。
 * 读侧(分类/类型/文章列表/详情)登录即可;
 * 分类/类型管理、审核、下架 = knowledge:manage;发文 = knowledge:publish;
 * 编辑/删除/附件 = 作者本人或 manage(service 内判)。
 */
@Controller('knowledge')
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  /* ─── 领域分类 ─── */

  @Get('categories')
  listCategories() {
    return this.svc.listCategories();
  }

  @Permission('knowledge:manage')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createCategory(dto, this.ctx(me, req));
  }

  @Permission('knowledge:manage')
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateCategory(id, dto, this.ctx(me, req));
  }

  @Permission('knowledge:manage')
  @Post('categories/reorder')
  reorderCategories(@Body() dto: ReorderCategoriesDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.reorderCategories(dto.items, this.ctx(me, req));
  }

  @Permission('knowledge:manage')
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeCategory(id, this.ctx(me, req));
  }

  /* ─── 内容类型(审核开关) ─── */

  @Get('types')
  listTypes() {
    return this.svc.listTypes();
  }

  @Permission('knowledge:manage')
  @Post('types')
  createType(@Body() dto: CreateTypeDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createType(dto, this.ctx(me, req));
  }

  @Permission('knowledge:manage')
  @Patch('types/:code')
  updateType(
    @Param('code') code: string,
    @Body() dto: UpdateTypeDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateType(code, dto, this.ctx(me, req));
  }

  @Permission('knowledge:manage')
  @Delete('types/:code')
  removeType(@Param('code') code: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeType(code, this.ctx(me, req));
  }

  /* ─── 文章:读侧 ─── */

  @Get('articles')
  listArticles(
    @CurrentUser() me: AuthPayload,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('typeCode') typeCode?: string,
    @Query('tag') tag?: string,
    @Query('mine') mine?: string,
    @Query('favorite') favorite?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listArticles(
      {
        q,
        categoryId,
        typeCode,
        tag,
        mine: mine === '1' || mine === 'true',
        favorite: favorite === '1' || favorite === 'true',
        status,
        sort: sort === 'hot' ? 'hot' : 'latest',
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      me.sub,
    );
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.getArticle(id, me.sub);
  }

  @Post('articles/:id/view')
  recordView(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.recordView(id, me.sub);
  }

  /* ─── 文章:写侧 ─── */

  @Permission('knowledge:publish')
  @Post('articles')
  createArticle(@Body() dto: CreateArticleDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createArticle(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch('articles/:id')
  updateArticle(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateArticle(id, dto, this.ctx(me, req));
  }

  @Post('articles/:id/submit')
  submitArticle(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.submitArticle(id, this.ctx(me, req));
  }

  @Permission('knowledge:manage')
  @Post('articles/:id/review')
  reviewArticle(
    @Param('id') id: string,
    @Body() dto: ReviewArticleDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.reviewArticle(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Permission('knowledge:manage')
  @Post('articles/:id/unpublish')
  unpublishArticle(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.unpublishArticle(id, this.ctx(me, req));
  }

  @Delete('articles/:id')
  removeArticle(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeArticle(id, this.ctx(me, req));
  }

  /* ─── 资源上传(规范命名:标题-序号,集中 article-<id>)——图片/视频/附件共用 ─── */

  @Post('articles/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadResource(
    @Param('id') id: string,
    @UploadedFile() file: UploadedResource | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    return this.svc.uploadResource(
      id,
      { originalName: decodeMulterName(file.originalname), mimeType: file.mimetype, buffer: file.buffer },
      this.ctx(me, req),
    );
  }

  /* ─── 附件 ─── */

  @Post('articles/:id/attachments')
  addAttachment(
    @Param('id') id: string,
    @Body() dto: AddAttachmentDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.addAttachment(id, dto, this.ctx(me, req));
  }

  @Delete('attachments/:id')
  removeAttachment(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeAttachment(id, this.ctx(me, req));
  }

  @Post('attachments/:id/download')
  attachmentDownloaded(@Param('id') id: string) {
    return this.svc.attachmentDownloaded(id);
  }
}
