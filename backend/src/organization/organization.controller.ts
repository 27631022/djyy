import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OrganizationService } from './organization.service';
import { OrgScopeService } from './org-scope.service';
import { CreateOrganizationDto, OrgKind } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ResolvePartyOrgsDto } from './dto/resolve-org.dto';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { AuditService } from '../audit';

/**
 * 鉴权约定(2026-07-12 三级数据权限):
 *   - 全部接口要求登录(此前整个 controller 连 AuthGuard 都没挂,属安全缺口);
 *   - 树/列表「结构」对所有登录用户可见(任务派发/考核/筛选器等业务组件依赖全量树);
 *     resolve-party(党组织名→对口单位)同档 —— 只回结构不回成员,暴露面窄于 tree;
 *   - 成员名单按登录人数据范围放行(管理范围/兜底本单位子树=完整;对口上级=仅直接成员);
 *   - 写操作 @Permission('admin:org:write') + OrgScopeService 按目标组织的 kind 分维校验范围
 *     (党委管理员经党维锚点管党组织结构,机构管理员不授 org:write 则不能动行政树)。
 */
@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationController {
  constructor(
    private readonly service: OrganizationService,
    private readonly scope: OrgScopeService,
    private readonly audit: AuditService,
  ) {}

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

  /**
   * POST /api/organizations/resolve-party   党组织名 → 对口行政机构(批量)
   *
   * 证书发证「先进基层党委/党支部」这类集体荣誉自动带出「所在单位」用。
   *
   * 鉴权:登录即可、**不加 @Permission、不做数据范围收敛** —— 与「树/列表结构对所有
   * 登录用户可见」同档(见类顶部约定)。本接口只回组织名称/路径/关联关系,
   * **不回任何成员信息**,暴露面严格窄于已开放的 GET /organizations/tree。
   *
   * 位置:必须排在 @Get(':id') 之前(POST 组当前虽无 :id 路由,仍照既有防御性约定)。
   */
  @Post('resolve-party')
  resolveParty(@Body() dto: ResolvePartyOrgsDto) {
    return this.service.resolvePartyOrgs(dto.names);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * GET /api/organizations/:id/members                直接成员
   * GET /api/organizations/:id/members?recursive=true 含所有下级 (体现传递性归属)
   *
   * 数据范围:管理范围/本单位兜底 = full;对口上级机构 = 仅直接成员(recursive 被降级);范围外 403。
   */
  @Get(':id/members')
  async members(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Query('recursive') recursive?: string,
  ) {
    const access = await this.scope.membersAccess(me.sub, id);
    if (access === 'none') {
      throw new ForbiddenException('该组织的成员名单不在你的可见范围内');
    }
    return this.service.listMembers(id, access === 'full' && recursive === 'true');
  }

  /**
   * POST /api/organizations/:id/members/reorder
   * Body: { userIds: string[] }  —— 按顺序给本机构直接成员重排 sortOrder(拖拽排序)
   */
  @Post(':id/members/reorder')
  @Permission('admin:user:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderMembers(
    @Param('id') id: string,
    @Body() body: { userIds?: string[] },
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.scope.assertMembersReorderable(me.sub, id);
    await this.service.reorderMembers(id, body.userIds ?? []);
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.members.reorder',
      target: id,
      detail: { count: (body.userIds ?? []).length },
    });
  }

  /** GET /api/organizations/:id/links  党↔行政关联(返回对侧机构 + linkId) */
  @Get(':id/links')
  links(@Param('id') id: string) {
    return this.service.listLinksFor(id);
  }

  /** POST /api/organizations/:id/links  Body {otherOrgId} 关联一个党组织+一个行政机构 */
  @Post(':id/links')
  @Permission('admin:org:write')
  async addLink(
    @Param('id') id: string,
    @Body() body: { otherOrgId: string },
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.scope.assertLinkWritable(me.sub, id, body.otherOrgId);
    const link = await this.service.linkByOrgIds(id, body.otherOrgId, me.sub);
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.link.add',
      target: id,
      detail: { otherOrgId: body.otherOrgId },
    });
    return link;
  }

  /** DELETE /api/organizations/links/:linkId  解除关联 */
  @Delete('links/:linkId')
  @Permission('admin:org:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLink(
    @Param('linkId') linkId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const link = await this.service.findLink(linkId);
    await this.scope.assertLinkWritable(me.sub, link.partyOrgId, link.adminOrgId);
    await this.service.unlinkOrg(linkId);
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.link.remove',
      target: linkId,
      detail: { partyOrgId: link.partyOrgId, adminOrgId: link.adminOrgId },
    });
  }

  @Post()
  @Permission('admin:org:write')
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.scope.assertOrgCreatable(me.sub, dto.parentId ?? null);
    const created = await this.service.create(dto);
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.create',
      target: created.id,
      detail: { code: created.code, name: created.name, kind: created.kind, parentId: created.parentId },
    });
    return created;
  }

  @Patch(':id')
  @Permission('admin:org:write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.scope.assertOrgUpdatable(me.sub, id, dto.parentId, dto.active === false);
    const updated = await this.service.update(id, dto);
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.update',
      target: id,
      detail: { fields: Object.keys(dto ?? {}) },
    });
    return updated;
  }

  /**
   * POST /api/organizations/:id/move
   * Body: { targetId: string, position: 'before' | 'after' | 'inside' }
   * 用于拖拽改变父节点或同级排序
   */
  @Post(':id/move')
  @Permission('admin:org:write')
  async move(
    @Param('id') id: string,
    @Body() body: { targetId: string; position: 'before' | 'after' | 'inside' },
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.scope.assertOrgMovable(me.sub, id, body.targetId, body.position);
    const moved = await this.service.move(id, body.targetId, body.position);
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.move',
      target: id,
      detail: { targetId: body.targetId, position: body.position },
    });
    return moved;
  }

  /** DELETE /api/organizations/:id            软删 (置 active=false) */
  /** DELETE /api/organizations/:id?hard=true  硬删 (有子节点/成员则拒绝) */
  @Delete(':id')
  @Permission('admin:org:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
    @Query('hard') hard?: string,
  ) {
    await this.scope.assertOrgRemovable(me.sub, id);
    if (hard === 'true') {
      await this.service.hardDelete(id);
    } else {
      await this.service.softDelete(id);
    }
    await this.audit.log({
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
      action: 'org.delete',
      target: id,
      detail: { hard: hard === 'true' },
    });
  }
}
