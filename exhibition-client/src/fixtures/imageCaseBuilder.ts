import { Mesh, MeshBuilder, Texture, type Scene } from '@babylonjs/core';
import { Color3 } from '@babylonjs/core';
import type { Fixture, ImageCaseContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { glassMat, pbr } from '../scene/materialFactory';
import { placeholderTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';

export interface BuiltFixture {
  pickables: Mesh[];
  spotTargets?: Mesh[]; // 需要射灯时给出受光网格
}

/** 图片展柜(落地展板):底座 + 深色画框 + 卡纸 + 图片/占位 + 微反光玻璃 */
export function buildImageCase(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? { images: [] }) as ImageCaseContent;
  const w = Math.max(fx.w, 1.2);

  const frameMat = pbr(scene, `imgcase-frame:${fx.id}`, {
    color: Color3.FromHexString('#3A3A3E'),
    metallic: 0.6,
    roughness: 0.38,
  });
  const matteMat = pbr(scene, `imgcase-matte:${fx.id}`, {
    color: Color3.FromHexString('#FBFAF7'),
    roughness: 0.9,
  });

  // 底座
  const plinth = MeshBuilder.CreateBox(
    `imgcase-plinth:${fx.id}`,
    { width: w, height: 0.12, depth: 0.45 },
    scene,
  );
  plinth.position.set(0, 0.06, 0);
  plinth.material = frameMat;
  plinth.parent = root;

  // 画框(板体)
  const board = MeshBuilder.CreateBox(
    `imgcase-board:${fx.id}`,
    { width: w, height: 1.9, depth: 0.1 },
    scene,
  );
  board.position.set(0, 1.7, 0);
  board.material = frameMat;
  board.parent = root;

  // 卡纸内衬
  const matte = MeshBuilder.CreatePlane(
    `imgcase-matte-p:${fx.id}`,
    { width: w - 0.14, height: 1.76 },
    scene,
  );
  matte.position.set(0, 1.7, -0.052);
  matte.material = matteMat;
  matte.parent = root;

  // 图片面(有素材用素材,否则精致占位)
  const img = MeshBuilder.CreatePlane(
    `imgcase-img:${fx.id}`,
    { width: w - 0.34, height: 1.5 },
    scene,
  );
  img.position.set(0, 1.72, -0.056);
  const imgMat = pbr(scene, `imgcase-img-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.85,
  });
  const first = c.images?.[0];
  if (first?.url) {
    imgMat.albedoTexture = new Texture(first.url, scene);
  } else {
    imgMat.albedoTexture = placeholderTexture(scene, `imgcase-ph:${fx.id}`, {
      title: fx.label ?? '图片展柜',
      subtitle: '素材待上传',
      icon: '🖼',
      accent: theme.accent.toHexString(),
      ratio: (w - 0.34) / 1.5,
    });
  }
  img.material = imgMat;
  img.parent = root;

  // 玻璃罩面
  const glass = MeshBuilder.CreatePlane(
    `imgcase-glass:${fx.id}`,
    { width: w - 0.14, height: 1.76 },
    scene,
  );
  glass.position.set(0, 1.7, -0.075);
  glass.material = glassMat(scene, `imgcase-glass-mat:${fx.id}`);
  glass.parent = root;

  const pickables = [board, matte, img, glass, plinth];
  markPickable(pickables, fx);
  return { pickables, spotTargets: [board, matte, img] };
}
