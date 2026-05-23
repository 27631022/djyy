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
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('certificate-templates')
@UseGuards(AuthGuard)
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
