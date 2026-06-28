import { Color3, MeshBuilder, Texture, type Scene } from '@babylonjs/core';
import type { Fixture, FlagContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { placeholderTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/**
 * 党旗 / 旗帜:贴墙贴图平面(双面),上传旗面图。挤出做旗语义不符、成本高 —— 用平面贴图最实用。
 * 红旗在亮侧墙会被 IBL 洗淡 → 压低 environmentIntensity(同 wallDecor clampEnv 思路),颜色跨墙稳定。
 */
export function buildFlag(scene: Scene, fx: Fixture, theme: ThemeParams): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as FlagContent;
  const w = Math.max(fx.w, 0.6);
  const h = c.frameH ? Math.min(3, Math.max(0.3, c.frameH)) : w * (2 / 3); // 旗面默认 3:2
  const centerY = (c.baseElevM ?? 1.4) + h / 2;
  const poleX = c.withPole ? -w / 2 - 0.04 : 0; // 配旗杆时旗面右移,杆在左
  const flagX = c.withPole ? poleX + 0.04 + w / 2 : 0;

  const mat = pbr(scene, `flag-mat:${fx.id}`, { color: Color3.White(), roughness: 0.62 });
  const tex = c.imageUrl
    ? new Texture(c.imageUrl, scene)
    : placeholderTexture(scene, `flag-ph:${fx.id}`, {
        title: fx.label ?? '党旗',
        subtitle: '上传旗面图',
        icon: '🚩',
        accent: theme.accent.toHexString(),
        ratio: w / h,
      });
  mat.albedoTexture = tex;
  mat.environmentIntensity = 0.8; // 防红旗被 HDR 环境光洗淡

  // 旗面(单面板;背面再来一块,旋转 π,画面不镜像)
  const mkFace = (flip: boolean) => {
    const s = MeshBuilder.CreatePlane(`flag:${fx.id}:${flip ? 'b' : 'f'}`, { width: w, height: h }, scene);
    s.position.set(flagX, centerY, flip ? 0.012 : -0.012);
    if (flip) s.rotation.y = Math.PI;
    s.material = mat;
    s.parent = root;
    return s;
  };
  const pickables = [mkFace(false), mkFace(true)];

  if (c.withPole) {
    const top = centerY + h / 2 + 0.18;
    const bottom = (c.baseElevM ?? 1.4) - 0.1;
    const pole = MeshBuilder.CreateCylinder(`flag-pole:${fx.id}`, { diameter: 0.05, height: top - bottom, tessellation: 12 }, scene);
    pole.position.set(poleX, (top + bottom) / 2, 0);
    pole.material = pbr(scene, `flag-pole-mat:${fx.id}`, { color: Color3.FromHexString('#C9A227'), metallic: 0.85, roughness: 0.3 });
    pole.parent = root;
    pickables.push(pole);
  }

  markPickable(pickables, fx);
  return { pickables, spotTargets: [pickables[0]] };
}
