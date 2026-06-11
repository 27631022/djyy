import { Module } from '@nestjs/common';
import { StorageModule } from '../storage';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { Model3dService } from './model3d.service';
import { Model3dController, PublicModel3dController } from './model3d.controller';

/**
 * 3D 模型 AI 生成模块(3D 展厅地基)。
 * 依赖:storage(存图片/3D 模型)+ external-api(选 3D 生成 provider)
 * + prompt(看图起名提示词)+ audit/prisma(全局)。叶子模块、无人依赖 → 不破 DAG。
 */
@Module({
  imports: [StorageModule, ExternalApiModule, PromptModule],
  controllers: [Model3dController, PublicModel3dController],
  providers: [Model3dService],
  exports: [Model3dService],
})
export class Model3dModule {}
