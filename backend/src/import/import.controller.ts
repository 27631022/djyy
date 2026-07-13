import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { ForbiddenException } from '@nestjs/common';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { OrgScopeService } from '../organization';
import { ImportService } from './import.service';

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
}

/**
 * 组织机构 + 用户 批量导入(Excel)。
 * 模板下载 GET /import/templates/*;导入 POST /import/*(multipart 上传 xlsx)。
 * 全部要登录 + 相应写权限(org 导入 admin:org:write / 用户导入 admin:user:write)。
 */
@Controller('import')
@UseGuards(AuthGuard)
export class ImportController {
  constructor(
    private readonly svc: ImportService,
    private readonly scope: OrgScopeService,
  ) {}

  /**
   * 批量导入是全局管理动作(建号/建组织/挂归属整库铺开),要求「不受范围限制」的管理身份 ——
   * 否则受限角色(org_admin/party_admin)可经导入走 Service DI 路径绕过 controller 层的范围/锚点
   * 校验,批量创建根级组织或把范围外归属静默写入(finding #2/#8:import 越权 + catch 吞 Forbidden)。
   */
  private async assertGlobalImporter(actorId: string, perm: 'admin:org:write' | 'admin:user:write') {
    const ws = await this.scope.resolveWrite(actorId, perm);
    if (!ws.unrestricted) {
      throw new ForbiddenException('批量导入需要全局管理权限(平台管理员/一级企业管理员),请联系系统管理员');
    }
  }

  @Get('templates/organizations')
  @Permission('admin:org:write')
  orgTemplate(@Res() res: Response) {
    this.sendXlsx(res, this.svc.buildOrgTemplate(), '组织机构导入模板.xlsx');
  }

  @Get('templates/users')
  @Permission('admin:user:write')
  userTemplate(@Res() res: Response) {
    this.sendXlsx(res, this.svc.buildUserTemplate(), '用户导入模板.xlsx');
  }

  @Post('organizations')
  @Permission('admin:org:write')
  @UseInterceptors(FileInterceptor('file'))
  async importOrgs(
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.assertGlobalImporter(me.sub, 'admin:org:write');
    if (!file) throw new BadRequestException('请上传要导入的 Excel 文件');
    return this.svc.importOrganizations(file.buffer, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post('users')
  @Permission('admin:user:write')
  @UseInterceptors(FileInterceptor('file'))
  async importUsers(
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    await this.assertGlobalImporter(me.sub, 'admin:user:write');
    if (!file) throw new BadRequestException('请上传要导入的 Excel 文件');
    return this.svc.importUsers(file.buffer, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  private sendXlsx(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // 中文文件名:filename* 走 RFC5987 UTF-8 编码,filename 兜底给老浏览器
      'Content-Disposition': `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
  }
}
