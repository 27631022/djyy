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
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
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
  constructor(private readonly svc: ImportService) {}

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
  importOrgs(
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('请上传要导入的 Excel 文件');
    return this.svc.importOrganizations(file.buffer, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post('users')
  @Permission('admin:user:write')
  @UseInterceptors(FileInterceptor('file'))
  importUsers(
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
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
