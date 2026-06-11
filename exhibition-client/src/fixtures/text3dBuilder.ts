import earcut from 'earcut';
import { Color3, Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { Fixture, Text3dContent, TypefaceFontSubset } from '../types';
import type { ThemeParams } from '../theme/presets';
import { emissiveMat, pbr } from '../scene/materialFactory';
import { placeholderTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

type FontDataParam = Parameters<typeof MeshBuilder.CreateText>[2];

/**
 * 立体字(text_3d):后端字体子集(typeface 格式)→ CreateText 挤出。
 * finish:paint 烤漆 / metal 金属 / glow 发光(GlowLayer 拾取 emissive)。
 * 回退:字体缺失或挤出失败 → 平面占位字(不阻塞整厅)。
 */
export function buildText3d(
  scene: Scene,
  fx: Fixture,
  fontData: TypefaceFontSubset | null,
  theme: ThemeParams,
  wallH: number,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as Text3dContent;
  const text = c.text || fx.label || '';
  const size = c.sizeM ?? 0.6;
  const depth = c.depthM ?? 0.12;
  const mount = c.mount ?? 'floor';
  const color = c.color ? Color3.FromHexString(c.color) : theme.accent;

  let mesh: Mesh | null = null;
  if (fontData && text) {
    try {
      mesh = MeshBuilder.CreateText(
        `t3d:${fx.id}`,
        text,
        fontData as unknown as FontDataParam,
        { size, depth, resolution: 6 },
        scene,
        earcut as unknown as Parameters<typeof MeshBuilder.CreateText>[5],
      );
    } catch (e) {
      console.warn(`[展厅] 3D 文字挤出失败(${fx.id}),回退平面字:`, e);
    }
  }

  if (mesh) {
    // 归一定位:水平居中;floor=字脚落地,wall=中心抬到展示高,flat=平铺地面(地板字)
    const bb = mesh.getBoundingInfo().boundingBox;
    const cx = (bb.minimum.x + bb.maximum.x) / 2;
    const cy = (bb.minimum.y + bb.maximum.y) / 2;
    if (mount === 'flat') {
      // 平躺(地板字):+π/2 字面朝上(AB 实测对比敲定;-π/2 是字背壳=镜像)。
      // 正读站位 = fixture 的「正面侧」(2D 画布朝向小三角指向的那一侧)往下看;
      // 要换读向,在设计器把组件旋转 180° 即可。
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(-cx, depth + 0.015, cy);
    } else {
      const targetY = mount === 'wall' ? Math.min(wallH * 0.55, 2.6) : -bb.minimum.y + 0.01;
      mesh.position.set(-cx, mount === 'wall' ? targetY - cy : targetY, 0);
    }
    mesh.parent = root;

    const finish = c.finish ?? 'paint';
    if (finish === 'glow') {
      mesh.material = emissiveMat(scene, `t3d-mat:${fx.id}`, color);
    } else if (finish === 'metal') {
      mesh.material = pbr(scene, `t3d-mat:${fx.id}`, {
        color,
        metallic: 0.95,
        roughness: 0.28,
      });
    } else {
      mesh.material = pbr(scene, `t3d-mat:${fx.id}`, { color, roughness: 0.45 });
    }
    markPickable([mesh], fx);
    return { pickables: [mesh] };
  }

  // 回退:平面占位字
  const plane = MeshBuilder.CreatePlane(
    `t3d-fallback:${fx.id}`,
    { width: Math.max(fx.w, 2), height: Math.max(fx.w, 2) / 3 },
    scene,
  );
  plane.position.set(0, mount === 'wall' ? Math.min(wallH * 0.55, 2.6) : 1.2, 0);
  const mat = pbr(scene, `t3d-fallback-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.8,
  });
  mat.albedoTexture = placeholderTexture(scene, `t3d-fallback-tex:${fx.id}`, {
    title: text || '立体字',
    accent: theme.accent.toHexString(),
    ratio: 3,
  });
  plane.material = mat;
  plane.parent = root;
  markPickable([plane], fx);
  return { pickables: [plane] };
}
