import earcut from 'earcut';
import { Color3, Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { Fixture, Text3dContent, TypefaceFontSubset } from '../types';
import type { ThemeParams } from '../theme/presets';
import { emissiveMat, pbr } from '../scene/materialFactory';
import { placeholderTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

type FontDataParam = Parameters<typeof MeshBuilder.CreateText>[2];

/** 挤出厚度 = 字高 × 该比例(厚度不再单独设置,随字号等比) */
const DEPTH_RATIO = 0.2;

/** content 的 font/weight → 后端字体 key(sans / sans-light / … / serif-black 共 10 档) */
export function fontKeyOf(c: Text3dContent): string {
  const fam = c.font === 'serif' ? 'serif' : 'sans';
  const w = c.weight ?? 'regular';
  return w === 'regular' ? fam : `${fam}-${w}`;
}

/** 离地高度默认值:贴墙字悬在展示高,落地/地板字贴地 */
export function defaultElev(mount: Text3dContent['mount']): number {
  return mount === 'wall' ? 1.5 : 0;
}

/**
 * 立体字(text_3d):后端字体子集(typeface 格式,union 过的干净轮廓)→ CreateText 挤出。
 * 尺寸规则(2026-06-11 重做):**文字整体宽度 = fixture.w(2D 画框宽)**,高度同比缩放,
 * 厚度自动(字高×0.2);离地高度 elevM = 字底距地。finish:paint/metal/glow。
 * 回退:字体缺失或挤出失败 → 平面占位字(不阻塞整厅)。
 */
export function buildText3d(
  scene: Scene,
  fx: Fixture,
  fonts: Map<string, TypefaceFontSubset>,
  theme: ThemeParams,
  wallH: number,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as Text3dContent;
  const fontData = fonts.get(fontKeyOf(c)) ?? null;
  const text = c.text || fx.label || '';
  const mount = c.mount ?? 'floor';
  const elev = c.elevM ?? defaultElev(mount);
  const color = c.color ? Color3.FromHexString(c.color) : theme.accent;

  let mesh: Mesh | null = null;
  if (fontData && text) {
    try {
      // 先按 size=1 挤出再整体缩放:厚度按 DEPTH_RATIO 给,缩放后自动保持比例
      mesh = MeshBuilder.CreateText(
        `t3d:${fx.id}`,
        text,
        fontData as unknown as FontDataParam,
        { size: 1, depth: DEPTH_RATIO, resolution: 4 },
        scene,
        earcut as unknown as Parameters<typeof MeshBuilder.CreateText>[5],
      );
    } catch (e) {
      console.warn(`[展厅] 3D 文字挤出失败(${fx.id}),回退平面字:`, e);
    }
  }

  if (mesh) {
    // 同比缩放:文字自然宽 → 画框宽 fx.w(高度/厚度随缩放等比)
    const bb = mesh.getBoundingInfo().boundingBox;
    const naturalW = bb.maximum.x - bb.minimum.x;
    const s = naturalW > 0.001 ? Math.max(fx.w, 0.4) / naturalW : 1;
    mesh.scaling.setAll(s);
    const cx = (bb.minimum.x + bb.maximum.x) / 2;
    const cy = (bb.minimum.y + bb.maximum.y) / 2;
    const depth = DEPTH_RATIO * s; // 实际厚度(米)

    if (mount === 'flat') {
      // 平躺(地板字):+π/2 字面朝上(AB 实测对比敲定;-π/2 是字背壳=镜像)。
      // 正读站位 = fixture 的「正面侧」(2D 画布朝向小三角指向的那一侧)往下看;
      // 要换读向,在设计器把组件旋转 180° 即可。elevM 可整体抬离地面(如台阶上)。
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(-cx * s, depth + 0.015 + elev, cy * s);
    } else {
      // 落地/贴墙:字底 = elevM(落地默认 0 贴地,贴墙默认 1.5 展示高)
      mesh.position.set(-cx * s, elev - bb.minimum.y * s + (mount === 'floor' ? 0.01 : 0), 0);
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
