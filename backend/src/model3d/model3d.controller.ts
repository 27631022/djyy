import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { StorageService } from '../storage';
import { Model3dService } from './model3d.service';
import { GenerateModel3dDto } from './dto/generate-model3d.dto';

/**
 * 3D 模型 AI 生成 —— 收口 admin:menu(与前端「3D 生成」菜单一致)。
 * ⚠ 此前仅 AuthGuard:任何登录用户可触发付费的豆包 Seed3D 生成 = 成本滥用,已堵。
 *   POST /model3d/generate  { imageFileId, prompt? } → 异步生成 → 返回 { fileId, url }
 * 生成的 .glb 供 3D 展厅加载(公开加载走下方 PublicModel3dController,不受此门影响)。
 */
@Controller('model3d')
@UseGuards(AuthGuard)
@Permission('admin:menu')
export class Model3dController {
  constructor(private readonly svc: Model3dService) {}

  /** 创建 3D 生成任务,立刻返回 arkTaskId(Seed3D 较慢,前端拿它轮询) */
  @Post('generate')
  async generate(
    @Body() dto: GenerateModel3dDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createTask(
      dto.imageFileId,
      { actorId: me.sub, actorName: me.name, ip: req.ip },
      { prompt: dto.prompt },
    );
  }

  /** 轮询任务:running / done(带 fileId+url)/ failed。前端每 ~15s 调一次直到 done/failed。 */
  @Get('tasks/:arkTaskId')
  async task(
    @Param('arkTaskId') arkTaskId: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.getTask(arkTaskId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}

/**
 * 公开 3D 模型口(免登录、持久)—— 3D 展厅 / 查看器直接加载 .glb。
 *   GET /public/model3d/:id → 流式 3D 模型文件
 * 安全:只放行 storage 里 ownerModule=model3d 的文件。
 */
@Controller('public/model3d')
export class PublicModel3dController {
  constructor(private readonly storage: StorageService) {}

  @Get(':id')
  async serve(@Param('id') id: string): Promise<StreamableFile> {
    const meta = await this.storage.getMeta(id);
    if (meta.ownerModule !== 'model3d') {
      throw new NotFoundException('不是 3D 模型文件');
    }
    const { stream } = await this.storage.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }
}
