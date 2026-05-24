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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DictionaryService } from './dictionary.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
import { ReorderDictItemsDto } from './dto/reorder-items.dto';

@Controller('dictionaries')
@UseGuards(AuthGuard)
export class DictionaryController {
  constructor(private readonly dicts: DictionaryService) {}

  @Get()
  list(@Query('inactive') inactive?: string) {
    return this.dicts.listDictionaries(inactive === 'true');
  }

  /** 通过 id 或 code 查询单个字典(含项目),前端下拉直接 `GET /dictionaries/admin_position` */
  @Get(':idOrCode')
  findOne(@Param('idOrCode') idOrCode: string, @Query('inactive') inactive?: string) {
    return this.dicts.findDictionary(idOrCode, inactive === 'true');
  }

  @Post()
  create(@Body() dto: CreateDictionaryDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.dicts.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDictionaryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.dicts.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /* ─── 字典项 ─── */

  @Post(':id/items')
  createItem(
    @Param('id') id: string,
    @Body() dto: CreateDictItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.createItem(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateDictItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.updateItem(id, itemId, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.removeItem(id, itemId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /**
   * 批量重排序同父项下的字典项 — 拖拽完成后前端一次性提交新顺序。
   */
  @Post(':id/items/reorder')
  reorderItems(
    @Param('id') id: string,
    @Body() dto: ReorderDictItemsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.reorderItems(id, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
