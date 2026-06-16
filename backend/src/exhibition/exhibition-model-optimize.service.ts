import { Injectable, NotFoundException } from '@nestjs/common';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, simplify, textureCompress, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { StorageService } from '../storage';
import { AuditService } from '../audit';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 优化档位:原(只缩贴图、保几何,画质最好)/ 中(减面 50%)/ 小(减面 75%)。
 *  档名直接做产物文件名后缀(源=「原始文件」不动,产物=「<原名>-中.glb」「-小.glb」一眼可辨)。 */
export type OptimizePreset = 'orig' | 'medium' | 'small';

/** 各档参数:label=档名(产物后缀);ratio=目标保留面数比(1=不减面);error=简化误差容差;texSize=贴图最大边 */
const PRESETS: Record<OptimizePreset, { label: string; ratio: number; error: number; texSize: number }> = {
  orig: { label: '原', ratio: 1, error: 0, texSize: 1024 },
  medium: { label: '中', ratio: 0.5, error: 0.01, texSize: 1024 },
  small: { label: '小', ratio: 0.25, error: 0.04, texSize: 1024 },
};

/** 已有的档位后缀(再次优化时先剥掉,避免「-中-小」越叠越长) */
const TIER_SUFFIX = /-(原|中|小|opt)$/;

export interface OptimizeResult {
  newFileId: string;
  newName: string;
  beforeVertices: number;
  afterVertices: number;
  beforeSize: number;
  afterSize: number;
}

const MODEL_EXT = /\.(glb|gltf)$/i;

/**
 * 模型「一键优化」:把上传的高模在服务端瘦身后另存为模型库新文件,治本降低集显近距离渲染开销。
 *
 * 管线(@gltf-transform,均 WASM/JS 无原生编译):weld 焊点 → dedup 去重 → simplify 减面
 * (MeshoptSimplifier)→ textureCompress 缩贴图(sharp,保留原格式不有损压坏法线图)→ prune 清孤儿。
 * ⚠ v1 不做 Draco/KTX2 压缩:Draco 只减下载体积、不减渲染开销(GPU 里仍解压成完整几何),且需客户端
 *   自托管解码器(内网无 CDN,否则优化后反而加载失败)。卡顿的根 = 顶点数 + 贴图尺寸,靠 simplify +
 *   缩贴图根治,产物是标准 glb 任何地方都能加载、零客户端改动。Draco/KTX2 留作后续(配套解码器一起上)。
 * ⚠ 处理在主线程同步跑(实测 90MB 模型 ~2-3s),管理员低频操作可接受;将来要并发可移 worker_thread。
 */
@Injectable()
export class ExhibitionModelOptimizeService {
  constructor(
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async optimize(fileId: string, preset: OptimizePreset, ctx: AuditCtx): Promise<OptimizeResult> {
    const { meta, buffer } = await this.storage.getBuffer(fileId);
    const inLibrary =
      (meta.ownerModule === 'exhibition' && meta.folder === 'model-library') ||
      (meta.ownerModule === 'model3d' && meta.folder === 'models');
    if (!inLibrary || !MODEL_EXT.test(meta.originalName)) {
      throw new NotFoundException('不是模型库文件');
    }
    const { label, ratio, error, texSize } = PRESETS[preset] ?? PRESETS.medium;

    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    await MeshoptSimplifier.ready;

    const doc = await io.readBinary(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    );
    const beforeVertices = this.countVertices(doc);

    const steps = [weld(), dedup()];
    if (ratio < 1) {
      steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
    }
    // resize 只缩不放、保留原格式(法线图保 PNG 不被有损压坏);仅缩尺寸即削显存/带宽
    steps.push(textureCompress({ encoder: sharp, resize: [texSize, texSize] }));
    steps.push(prune());
    await doc.transform(...steps);

    const afterVertices = this.countVertices(doc);
    const out = Buffer.from(await io.writeBinary(doc));

    // 另存为模型库新文件「<原名>-<档名>.glb」(如 -中 / -小),与源同夹;源保留(=「原」,用户对比后自行删)
    const base = meta.originalName.replace(MODEL_EXT, '').replace(TIER_SUFFIX, '');
    const saved = await this.storage.put(
      {
        buffer: out,
        originalName: `${base}-${label}.glb`,
        mimeType: 'model/gltf-binary',
        ownerModule: 'exhibition',
        folder: 'model-library',
        visibility: 'public',
        createdById: ctx.actorId,
      },
      ctx,
    );

    await this.audit.log({
      action: 'exhibition.model.optimize',
      target: saved.id,
      ...ctx,
      detail: JSON.stringify({
        from: fileId,
        preset,
        beforeVertices,
        afterVertices,
        beforeSize: meta.size,
        afterSize: saved.size,
      }),
    });

    return {
      newFileId: saved.id,
      newName: saved.originalName,
      beforeVertices,
      afterVertices,
      beforeSize: meta.size,
      afterSize: saved.size,
    };
  }

  private countVertices(doc: Document): number {
    let v = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (pos) v += pos.getCount();
      }
    }
    return v;
  }
}
