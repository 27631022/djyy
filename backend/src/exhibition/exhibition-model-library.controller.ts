import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth';
import { Permission } from '../permission';
import { StorageService, type StoredFileMeta } from '../storage';
import { exhibitionAssetUrl } from './exhibition.types';

/** 模型库条目(上传库 + AI 生成历史 两源合并) */
export interface LibraryModelItem {
  id: string; // storage fileId(模型台 content.modelFileId 直接用)
  name: string;
  size: number;
  createdAt: Date;
  /** upload=手动上传(exhibition/model-library 文件夹) / ai=3D 生成产物(model3d/models) */
  source: 'upload' | 'ai';
  /** 公开预览/加载 URL(素材口) */
  url: string;
}

const MODEL_EXT = /\.(glb|gltf)$/i;

/**
 * 模型库:统一管理可上展台的 3D 模型。
 *  - 上传:前端直接 storageApi.upload({ownerModule:'exhibition', folder:'model-library'}),无需专门口;
 *  - 删除:走通用 DELETE /files/:id;
 *  - 本控制器只做两源合并列表。AI 生成的模型(ownerModule=model3d)经素材口放行可直接上展台。
 */
@Controller('exhibition/model-library')
@UseGuards(AuthGuard)
export class ExhibitionModelLibraryController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  @Permission('exhibition:manage')
  async list(): Promise<LibraryModelItem[]> {
    const [uploaded, generated] = await Promise.all([
      this.storage.list({ ownerModule: 'exhibition', folder: 'model-library', limit: 200 }),
      this.storage.list({ ownerModule: 'model3d', folder: 'models', limit: 200 }),
    ]);
    const toItem = (m: StoredFileMeta, source: 'upload' | 'ai'): LibraryModelItem => ({
      id: m.id,
      name: m.originalName,
      size: m.size,
      createdAt: m.createdAt,
      source,
      url: exhibitionAssetUrl(m.id),
    });
    return [
      ...uploaded.filter((m) => MODEL_EXT.test(m.originalName)).map((m) => toItem(m, 'upload')),
      ...generated.filter((m) => MODEL_EXT.test(m.originalName)).map((m) => toItem(m, 'ai')),
    ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
}
