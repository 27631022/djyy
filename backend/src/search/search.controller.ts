import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { SearchService } from './search.service';

/**
 * 全站搜索(登录即可,无 @Permission —— 可见性由各内容模块过滤:
 * published 知识/晒场 + 公开导航 + 仅本人证书)。读操作不写审计(与 knowledge search-suggest 一致)。
 *   GET /search/suggest?q=&limit=      联想:各组前 N 条 + 组 total
 *   GET /search?q=&type=&page=&pageSize=  结果页:无 type=每组前10;有 type=单组分页
 */
@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get('suggest')
  suggest(
    @CurrentUser() me: AuthPayload,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.suggest(q ?? '', limit ? Number(limit) : undefined, me.sub);
  }

  @Get()
  search(
    @CurrentUser() me: AuthPayload,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.search(
      {
        q: q ?? '',
        type,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      me.sub,
    );
  }
}
