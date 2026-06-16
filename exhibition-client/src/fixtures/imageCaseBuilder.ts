import { Mesh, MeshBuilder, Texture, type Scene } from '@babylonjs/core';
import { Color3 } from '@babylonjs/core';
import type { Fixture, ImageCaseContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { glassMat, pbr } from '../scene/materialFactory';
import { canvasTexture, placeholderTexture, wrapCjk } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';

export interface BuiltFixture {
  pickables: Mesh[];
  spotTargets?: Mesh[]; // 需要射灯时给出受光网格
}

/** 图下说明条高度(米) */
const CAP_H = 0.3;

/**
 * 图片展柜(落地展板):底座(带点缀灯线)+ 板体 + 金属包边 + **双面**展示
 * + 卡纸 + 图下说明条(caption)+ 微反光玻璃。
 * 板式 orientation:横屏(默认,板高 1.9)/ 竖屏(板高 2.2,图更高更窄);
 * 内容:正面 = images[0],背面 = backImages[0](未设背面 → images[1] → 沿用正面)。
 */
export function buildImageCase(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? { images: [] }) as ImageCaseContent;
  const w = Math.max(fx.w, 1.2);

  // 板式尺寸:竖屏板更高(0.55~2.75),横屏沿用旧比例(0.75~2.65)
  const portrait = c.orientation === 'portrait';
  const boardH = c.frameH ?? (portrait ? 2.2 : 1.9); // 画框(展板)高度,可调
  const boardCY = (c.baseElevM ?? (portrait ? 0.55 : 0.75)) + boardH / 2; // 下边缘离地高度 + 半高 = 板中心
  const showBase = c.showBase !== false; // 默认有底座;false = 贴墙/悬空式
  const matteH = boardH - 0.14;
  const matteTop = boardCY + matteH / 2;
  const matteBot = boardCY - matteH / 2;
  const imgW = w - 0.34;

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

  // 底座 + 正反两条点缀灯线(showBase=false 时不出,贴墙/悬空式)
  let plinth: Mesh | null = null;
  if (showBase) {
    plinth = MeshBuilder.CreateBox(
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
  }

  // 板体
  const board = MeshBuilder.CreateBox(
    `imgcase-board:${fx.id}`,
    { width: w, height: boardH, depth: 0.1 },
    scene,
  );
  board.position.set(0, boardCY, 0);
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
  mkEdge(w + EDGE * 2, EDGE, 0, boardCY + boardH / 2 + EDGE / 2); // 上
  mkEdge(w + EDGE * 2, EDGE, 0, boardCY - boardH / 2 - EDGE / 2); // 下
  mkEdge(EDGE, boardH + EDGE * 2, -(w / 2 + EDGE / 2), boardCY); // 左
  mkEdge(EDGE, boardH + EDGE * 2, w / 2 + EDGE / 2, boardCY); // 右

  /** 一面展示(side=-1 正面 / +1 背面):卡纸 + 图片(+图下说明条)+ 玻璃 */
  const pickables: Mesh[] = plinth ? [board, plinth] : [board];
  const spotTargets: Mesh[] = [board];
  const mkFace = (side: -1 | 1, entry?: { url?: string; caption?: string }) => {
    const flip = side === 1;
    const caption = entry?.caption?.trim() ?? '';

    const matte = MeshBuilder.CreatePlane(
      `imgcase-matte-p:${fx.id}:${side}`,
      { width: w - 0.14, height: matteH },
      scene,
    );
    matte.position.set(0, boardCY, side * 0.052);
    if (flip) matte.rotation.y = Math.PI;
    matte.material = matteMat;
    matte.parent = root;

    // 有说明条时图片上抬让位;无说明时几乎吃满卡纸
    const imgTop = matteTop - 0.1;
    const imgBot = caption ? matteBot + 0.2 + CAP_H : matteBot + 0.1;
    const imgH = imgTop - imgBot;
    const img = MeshBuilder.CreatePlane(
      `imgcase-img:${fx.id}:${side}`,
      { width: imgW, height: imgH },
      scene,
    );
    img.position.set(0, (imgTop + imgBot) / 2, side * 0.056);
    if (flip) img.rotation.y = Math.PI;
    const imgMat = pbr(scene, `imgcase-img-mat:${fx.id}:${side}`, {
      color: Color3.White(),
      roughness: 0.85,
    });
    if (entry?.url) {
      imgMat.albedoTexture = new Texture(entry.url, scene);
    } else {
      imgMat.albedoTexture = placeholderTexture(scene, `imgcase-ph:${fx.id}:${side}`, {
        title: fx.label ?? '图片展柜',
        subtitle: '素材待上传',
        icon: '🖼',
        accent: theme.accent.toHexString(),
        ratio: imgW / imgH,
      });
    }
    img.material = imgMat;
    img.parent = root;
    pickables.push(matte, img);
    spotTargets.push(matte, img);

    // 图下说明条(与卡纸同底色,印刷感深灰字,最多两行)
    if (caption) {
      const cap = MeshBuilder.CreatePlane(
        `imgcase-cap:${fx.id}:${side}`,
        { width: imgW, height: CAP_H },
        scene,
      );
      cap.position.set(0, matteBot + 0.1 + CAP_H / 2, side * 0.056);
      if (flip) cap.rotation.y = Math.PI;
      const capMat = pbr(scene, `imgcase-cap-mat:${fx.id}:${side}`, {
        color: Color3.White(),
        roughness: 0.92,
      });
      const TW = 1024;
      const TH = Math.max(64, Math.round((TW * CAP_H) / imgW));
      capMat.albedoTexture = canvasTexture(
        scene,
        `imgcase-cap-tex:${fx.id}:${side}`,
        TW,
        TH,
        (ctx, tw, th) => {
          ctx.fillStyle = '#FBFAF7';
          ctx.fillRect(0, 0, tw, th);
          ctx.fillStyle = '#3F3F46';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `500 ${Math.round(th * 0.38)}px 'Microsoft YaHei', sans-serif`;
          const lines = wrapCjk(ctx, caption, tw * 0.92, 2);
          if (lines.length <= 1) {
            ctx.fillText(lines[0] ?? caption, tw / 2, th / 2 + 2);
          } else {
            ctx.fillText(lines[0], tw / 2, th * 0.3);
            ctx.fillText(lines[1], tw / 2, th * 0.74);
          }
        },
      );
      cap.material = capMat;
      cap.parent = root;
      pickables.push(cap);
      spotTargets.push(cap);
    }

    const g = MeshBuilder.CreatePlane(
      `imgcase-glass:${fx.id}:${side}`,
      { width: w - 0.14, height: matteH },
      scene,
    );
    g.position.set(0, boardCY, side * 0.075);
    if (flip) g.rotation.y = Math.PI;
    g.material = glass;
    g.parent = root;
    pickables.push(g);
  };
  // 双面:正面 images[0];背面 backImages[0](未设 → images[1] → 沿用正面)
  const frontEntry = c.images?.[0];
  const backEntry = c.backImages?.length ? c.backImages[0] : (c.images?.[1] ?? frontEntry);
  mkFace(-1, frontEntry);
  mkFace(1, backEntry);

  markPickable(pickables, fx);
  return { pickables, spotTargets };
}
