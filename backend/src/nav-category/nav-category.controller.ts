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
import { NavCategoryService } from './nav-category.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import {
  CreateNavCategoryDto,
  UpdateNavCategoryDto,
} from './dto/category.dto';
import { CreateNavItemDto, UpdateNavItemDto } from './dto/item.dto';
import {
  ReorderNavCategoriesDto,
  ReorderNavItemsDto,
} from './dto/reorder.dto';

@Controller('nav-categories')
export class NavCategoryController {
  constructor(private readonly svc: NavCategoryService) {}

  /** 公开:前台首页拉取 */
  @Get()
  list() {
    return this.svc.listForPortal();
  }

  /** 后台:列出全部(含禁用) */
  @Get('all')
  @UseGuards(AuthGuard)
  listAll() {
    return this.svc.listAll();
  }

  /* ─── 分类 ─── */

  @Post()
  @UseGuards(AuthGuard)
  createCategory(
    @Body() dto: CreateNavCategoryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createCategory(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateNavCategoryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateCategory(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  removeCategory(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.removeCategory(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /* ─── 项目 ─── */

  @Post(':id/items')
  @UseGuards(AuthGuard)
  createItem(
    @Param('id') id: string,
    @Body() dto: CreateNavItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createItem(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch('items/:itemId')
  @UseGuards(AuthGuard)
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateNavItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateItem(itemId, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete('items/:itemId')
  @UseGuards(AuthGuard)
  removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.removeItem(itemId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /* ─── 拖拽排序 ─── */

  /** 一级分类整体重排序 — 前端把全部分类的新顺序一次性提交 */
  @Post('reorder')
  @UseGuards(AuthGuard)
  reorderCategories(
    @Body() dto: ReorderNavCategoriesDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.reorderCategories(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 某分类下的项目重排序 — 跨分类不允许,服务端校验 */
  @Post(':id/items/reorder')
  @UseGuards(AuthGuard)
  reorderItems(
    @Param('id') categoryId: string,
    @Body() dto: ReorderNavItemsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.reorderItems(categoryId, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
