import { Color3, PBRMaterial, type Scene } from '@babylonjs/core';

interface PbrOpts {
  color: Color3;
  roughness?: number;
  metallic?: number;
  emissive?: Color3;
  alpha?: number;
}

/**
 * PBR 材质工厂:全场景统一走 PBR(配 IBL 才有「大气」质感)。
 * ⚠ 主题色是 sRGB hex,albedo/emissive 要线性空间 —— 必须 toLinearSpace(),
 *   否则红色被洗成粉色、整体发白(实测踩过)。
 */
export function pbr(scene: Scene, name: string, opts: PbrOpts): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = opts.color.toLinearSpace();
  m.metallic = opts.metallic ?? 0;
  m.roughness = opts.roughness ?? 0.8;
  if (opts.emissive) m.emissiveColor = opts.emissive.toLinearSpace();
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  return m;
}

/** 自发光(unlit)材质:灯带/发光字,GlowLayer 按 emissive 拾取 */
export function emissiveMat(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.unlit = true;
  m.albedoColor = Color3.Black();
  m.emissiveColor = color.toLinearSpace();
  return m;
}

/** 微反光玻璃(画框/展柜罩) */
export function glassMat(scene: Scene, name: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = new Color3(0.9, 0.93, 0.95);
  m.metallic = 0;
  m.roughness = 0.05;
  m.alpha = 0.07;
  return m;
}
