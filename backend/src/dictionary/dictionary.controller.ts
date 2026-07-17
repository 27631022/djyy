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
import { Permission } from '../permission';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
import { ReorderDictItemsDto } from './dto/reorder-items.dto';

@Controller('dictionaries')
@UseGuards(AuthGuard)
export class DictionaryController {
  constructor(private readonly dicts: DictionaryService) {}

  /**
   * 字典总览(全部字典 + 项数)—— 仅数据字典/自定义字段两个后台配置页消费(均 admin:menu 门控),
   * 故收口 admin:menu(此前仅 AuthGuard,任何登录用户可拉全部字典清单)。
   */
  @Get()
  @Permission('admin:menu')
  list(@Query('inactive') inactive?: string) {
    return this.dicts.listDictionaries(inactive === 'true');
  }

  /**
   * 通过 id 或 code 查询单个字典(含项目),前端下拉直接 `GET /dictionaries/admin_position`。
   * ⚠ 保持仅登录(不加 @Permission):这是跨域共享的「下拉选项参照数据」——
   * 被证书(certificate:issue)/会场(venue:manage)/通讯录(directory:manage)/用户(admin:user:read)/
   * 角色筛选器(admin:role:read)/配置页(admin:menu) 六个权限域各自消费,不存在共同权限点。
   * 任何收窄都会误伤某个合法非管理员角色(如党支部书记看用户时的「政治面貌」下拉)。低敏参照数据,越权风险低。
   */
  @Get(':idOrCode')
  findOne(@Param('idOrCode') idOrCode: string, @Query('inactive') inactive?: string) {
    return this.dicts.findDictionary(idOrCode, inactive === 'true');
  }

  // ── 写操作 = 后台配置动作,统一收口 admin:menu(与前端「数据字典」菜单 canSeeItem 门控一致)。 ──

  @Post()
  @Permission('admin:menu')
  create(@Body() dto: CreateDictionaryDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.dicts.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('admin:menu')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDictionaryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('admin:menu')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.dicts.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /* ─── 字典项 ─── */

  @Post(':id/items')
  @Permission('admin:menu')
  createItem(
    @Param('id') id: string,
    @Body() dto: CreateDictItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.dicts.createItem(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id/items/:itemId')
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
  @Permission('admin:menu')
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
