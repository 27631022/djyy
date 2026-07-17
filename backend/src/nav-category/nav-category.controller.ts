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
import { Permission } from '../permission';
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

  /** 公开:前台首页拉取(仅启用项,无敏感字段)—— 有意保持匿名可访问,不加守卫。 */
  @Get()
  list() {
    return this.svc.listForPortal();
  }

  /** 后台:列出全部(含禁用)—— 仅「首页导航」配置页消费,收口 admin:menu(此前仅 AuthGuard 越权)。 */
  @Get('all')
  @UseGuards(AuthGuard)
  @Permission('admin:menu')
  listAll() {
    return this.svc.listAll();
  }

  // ── 以下写操作 = 后台「首页导航」配置动作,统一 admin:menu(与菜单 canSeeItem 门控一致)。 ──

  /* ─── 分类 ─── */

  @Post()
  @UseGuards(AuthGuard)
  @Permission('admin:menu')
  createCategory(
    @Body() dto: CreateNavCategoryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createCategory(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
