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
import { CertificateService } from './certificate.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

/**
 * 证书模板 CRUD —— 收口 certificate:issue(与前端「证书模板 / 发证向导 / 设计器」菜单一致)。
 * ⚠ 此前仅 AuthGuard:任何登录用户可读/建/改/删证书模板 = 越权,已堵。
 * 发证/设计流程(certificate:issue)读模板挑选,故读写统一 certificate:issue。
 */
@Controller('certificate-templates')
@UseGuards(AuthGuard)
@Permission('certificate:issue')
export class CertificateController {
  constructor(private readonly svc: CertificateService) {}

  @Get()
  list(@Query('active') active?: string) {
    const flag =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.svc.listTemplates(flag);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getTemplate(id);
  }

  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createTemplate(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateTemplate(id, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.removeTemplate(id, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
