import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, OrgKind } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  /**
   * GET /api/organizations                       平铺列表 (全部)
   * GET /api/organizations?kind=party            仅党组织
   * GET /api/organizations?kind=admin            仅行政机构
   * GET /api/organizations?inactive=true         含已停用
   */
  @Get()
  list(@Query('kind') kind?: string, @Query('inactive') inactive?: string) {
    return this.service.findAll({
      kind: kind === 'party' || kind === 'admin' ? (kind as OrgKind) : undefined,
      includeInactive: inactive === 'true',
    });
  }

  /** GET /api/organizations/tree[?kind=party|admin]  嵌套树 */
  @Get('tree')
  tree(@Query('kind') kind?: string, @Query('inactive') inactive?: string) {
    return this.service.findTree({
      kind: kind === 'party' || kind === 'admin' ? (kind as OrgKind) : undefined,
      includeInactive: inactive === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * GET /api/organizations/:id/members                直接成员
   * GET /api/organizations/:id/members?recursive=true 含所有下级 (体现传递性归属)
   */
  @Get(':id/members')
  members(@Param('id') id: string, @Query('recursive') recursive?: string) {
    return this.service.listMembers(id, recursive === 'true');
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(id, dto);
  }

  /**
   * POST /api/organizations/:id/move
   * Body: { targetId: string, position: 'before' | 'after' | 'inside' }
   * 用于拖拽改变父节点或同级排序
   */
  @Post(':id/move')
  move(
    @Param('id') id: string,
    @Body() body: { targetId: string; position: 'before' | 'after' | 'inside' },
  ) {
    return this.service.move(id, body.targetId, body.position);
  }

  /** DELETE /api/organizations/:id            软删 (置 active=false) */
  /** DELETE /api/organizations/:id?hard=true  硬删 (有子节点/成员则拒绝) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Query('hard') hard?: string) {
    if (hard === 'true') {
      await this.service.hardDelete(id);
    } else {
      await this.service.softDelete(id);
    }
  }
}
