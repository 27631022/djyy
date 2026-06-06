import { Controller, Get, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { DesktopService } from './desktop.service';

/**
 * 桌面客户端自动更新(**公开**,不加 AuthGuard —— 更新检查在登录前也要能跑)。
 *   GET /api/desktop/latest.json  Tauri updater 清单(下载地址动态回指本服务器)
 *   GET /api/desktop/download     最新安装包(流式)
 * 客户端「检查更新」时,从它连接的服务器请求本接口;有新版即下载、验签、安装、自动重启。
 */
@Controller('desktop')
export class DesktopController {
  constructor(private readonly svc: DesktopService) {}

  @Get('latest.json')
  manifest(@Req() req: Request) {
    // host 含端口(如 10.10.10.195:3001),让下载地址回指同一台服务器,适配 IP 变化
    const host = req.headers.host ?? 'localhost:3001';
    return this.svc.getManifest(host);
  }

  @Get('download')
  download(): StreamableFile {
    const { path, name } = this.svc.installer();
    return new StreamableFile(this.svc.stream(path), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${name}"`,
    });
  }
}
