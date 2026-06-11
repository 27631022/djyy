import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { StorageService } from './storage.service';
import { UploadFileDto } from './dto/upload-file.dto';

/** multer 注入的文件形状(与 certificate/issue.controller 一致) */
interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * 修复 multipart 中文文件名乱码:multer/busboy 默认按 latin1 解析文件名,
 * UTF-8(中文)会变 mojibake(如「先进」→「å…ˆè¿›」)。按 latin1→utf8 还原;
 * 纯 ASCII 不受影响。表单字段(folder 等)走 UTF-8 解码不受此问题影响,无需处理。
 */
function decodeMulterFilename(name: string): string {
  if (!name) return name;
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

/**
 * 通用文件存储 API(鉴权)。
 *
 *   POST   /files       仅登录                       multipart 上传,返回 { id, ... }
 *   GET    /files/:id    仅登录                       流式下载/预览(StreamableFile)
 *   DELETE /files/:id   @Permission('file:delete')   软删 + 删字节
 *
 * 注:multipart 上限由 service.put 按扩展名分级校验(视频 300MB / 3D 100MB / 其余 30MB,
 *     见 storage.constants 的 EXT_MAX_BYTES),与 main.ts 的 json({limit:'50mb'})
 *     是两套(那只管 application/json),互不相干。
 * 公开下载不在此(降攻击面)—— 证书公开下载走证书自己的 /public/certificates/... 经 DI 调本服务。
 */
@Controller('files')
@UseGuards(AuthGuard)
export class StorageController {
  constructor(private readonly svc: StorageService) {}

  @Post()
  // 仅登录即可上传(无 @Permission)—— 接收/填报路径对全员开放,其依赖的文件上传也必须开放,
  // 否则花名册账号等「无角色」用户传不了填报附件(与 inbox/claim/fill 一致;整体权限收敛留后续)。
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    // 大小校验收敛到 service.put(按扩展名分级限额:视频 300MB / 3D 100MB / 其余 30MB)
    return this.svc.put(
      {
        buffer: file.buffer,
        originalName: decodeMulterFilename(file.originalname),
        mimeType: file.mimetype,
        ownerModule: dto.ownerModule,
        folder: dto.folder,
        visibility: dto.visibility,
        createdById: me.sub,
      },
      { actorId: me.sub, actorName: me.name, ip: req.ip },
    );
  }

  /** 签发短时效下载 URL — 前端用它做浏览器原生下载(不经 axios 内存 Blob) */
  @Get(':id/download-url')
  async downloadUrl(@Param('id') id: string) {
    const meta = await this.svc.getMeta(id);
    return { ...this.svc.signFileUrl(id), filename: meta.originalName };
  }

  @Get(':id')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const { meta, stream } = await this.svc.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }

  @Delete(':id')
  @Permission('file:delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.softDelete(id, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
