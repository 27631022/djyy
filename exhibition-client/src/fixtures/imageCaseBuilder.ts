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

/**
 * 图片展柜(落地展板):底座(带点缀灯线)+ 板体 + 金属包边 + **双面**展示
 * (正面第 1 张图、背面第 2 张图,只有一张则两面同图)+ 卡纸 + 微反光玻璃。
 * 中岛摆放时观众两侧都能看。
 */
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
  // 金属包边(精致细节):点缀色调和的亮金属,微发光描边
  const edgeMat = pbr(scene, `imgcase-edge:${fx.id}`, {
    color: theme.accent.scale(0.75),
    metallic: 0.85,
    roughness: 0.25,
    emissive: theme.accent.scale(0.1),
  });
  const glass = glassMat(scene, `imgcase-glass-mat:${fx.id}`);

  // 底座 + 正反两条点缀灯线
  const plinth = MeshBuilder.CreateBox(
    `imgcase-plinth:${fx.id}`,
    { width: w, height: 0.12, depth: 0.45 },
    scene,
  );
  plinth.position.set(0, 0.06, 0);
  plinth.material = frameMat;
  plinth.parent = root;
  for (const s of [-1, 1]) {
    const strip = MeshBuilder.CreateBox(
      `imgcase-pstrip:${fx.id}:${s}`,
      { width: w - 0.08, height: 0.02, depth: 0.012 },
      scene,
    );
    strip.position.set(0, 0.105, s * 0.225);
    strip.material = edgeMat;
    strip.isPickable = false;
    strip.parent = root;
  }

  // 板体
  const board = MeshBuilder.CreateBox(
    `imgcase-board:${fx.id}`,
    { width: w, height: 1.9, depth: 0.1 },
    scene,
  );
  board.position.set(0, 1.7, 0);
  board.material = frameMat;
  board.parent = root;

  // 四边金属包边条(包住板体边缘,前后各凸 1cm)
  const EDGE = 0.045;
  const mkEdge = (ew: number, eh: number, x: number, y: number) => {
    const e = MeshBuilder.CreateBox(
      `imgcase-edgebar:${fx.id}:${x}:${y}`,
      { width: ew, height: eh, depth: 0.12 },
      scene,
    );
    e.position.set(x, y, 0);
    e.material = edgeMat;
    e.isPickable = false;
    e.parent = root;
  };
  mkEdge(w + EDGE * 2, EDGE, 0, 1.7 + 0.95 + EDGE / 2); // 上
  mkEdge(w + EDGE * 2, EDGE, 0, 1.7 - 0.95 - EDGE / 2); // 下
  mkEdge(EDGE, 1.9 + EDGE * 2, -(w / 2 + EDGE / 2), 1.7); // 左
  mkEdge(EDGE, 1.9 + EDGE * 2, w / 2 + EDGE / 2, 1.7); // 右

  /** 一面展示(side=-1 正面 / +1 背面):卡纸 + 图片 + 玻璃 */
  const pickables: Mesh[] = [board, plinth];
  const spotTargets: Mesh[] = [board];
  const mkFace = (side: -1 | 1, image?: { url?: string }) => {
    const flip = side === 1;
    const matte = MeshBuilder.CreatePlane(
      `imgcase-matte-p:${fx.id}:${side}`,
      { width: w - 0.14, height: 1.76 },
      scene,
    );
    matte.position.set(0, 1.7, side * 0.052);
    if (flip) matte.rotation.y = Math.PI;
    matte.material = matteMat;
    matte.parent = root;

    const img = MeshBuilder.CreatePlane(
      `imgcase-img:${fx.id}:${side}`,
      { width: w - 0.34, height: 1.5 },
      scene,
    );
    img.position.set(0, 1.72, side * 0.056);
    if (flip) img.rotation.y = Math.PI;
    const imgMat = pbr(scene, `imgcase-img-mat:${fx.id}:${side}`, {
      color: Color3.White(),
      roughness: 0.85,
    });
    if (image?.url) {
      imgMat.albedoTexture = new Texture(image.url, scene);
    } else {
      imgMat.albedoTexture = placeholderTexture(scene, `imgcase-ph:${fx.id}:${side}`, {
        title: fx.label ?? '图片展柜',
        subtitle: '素材待上传',
        icon: '🖼',
        accent: theme.accent.toHexString(),
        ratio: (w - 0.34) / 1.5,
      });
    }
    img.material = imgMat;
    img.parent = root;

    const g = MeshBuilder.CreatePlane(
      `imgcase-glass:${fx.id}:${side}`,
      { width: w - 0.14, height: 1.76 },
      scene,
    );
    g.position.set(0, 1.7, side * 0.075);
    if (flip) g.rotation.y = Math.PI;
    g.material = glass;
    g.parent = root;

    pickables.push(matte, img, g);
    spotTargets.push(matte, img);
  };
  // 双面:正面第 1 张,背面第 2 张(没有第 2 张则两面同图)
  mkFace(-1, c.images?.[0]);
  mkFace(1, c.images?.[1] ?? c.images?.[0]);

  markPickable(pickables, fx);
  return { pickables, spotTargets };
}
