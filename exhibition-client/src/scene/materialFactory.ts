import { Color3, DynamicTexture, PBRMaterial, Texture, type Scene } from '@babylonjs/core';

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

/** 砖纹贴图覆盖的瓦片数(4×4 块/张,uScale = 跨度米数 / TILES) */
export const FLOOR_TEX_TILES = 4;

/**
 * 程序化地板砖纹(用户反馈纯色「不像地板」):以主题地板色为基调,
 * 画 1m 见方石材砖 —— 每块微明暗差 + 细对角纹理 + 深色砖缝。
 * DynamicTexture 为 sRGB,PBR albedoTexture 默认按 sRGB 采样,无需手动转线性。
 */
export function makeFloorTexture(scene: Scene, base: Color3, name = 'tex:floor'): DynamicTexture {
  const SIZE = 512;
  const tilePx = SIZE / FLOOR_TEX_TILES;
  const dt = new DynamicTexture(name, SIZE, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const [r, g, b] = [base.r * 255, base.g * 255, base.b * 255];
  const shade = (f: number) => `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;

  // 砖缝底色(深 22%)
  ctx.fillStyle = shade(0.78);
  ctx.fillRect(0, 0, SIZE, SIZE);

  const GROUT = 3; // 缝宽 px
  for (let i = 0; i < FLOOR_TEX_TILES; i++) {
    for (let j = 0; j < FLOOR_TEX_TILES; j++) {
      const x = i * tilePx + GROUT / 2;
      const y = j * tilePx + GROUT / 2;
      const w = tilePx - GROUT;
      // 每块砖微明暗差(确定性伪随机,免每次刷新闪变)
      const f = 0.97 + (((i * 7 + j * 13) % 5) / 5) * 0.06;
      ctx.fillStyle = shade(f);
      ctx.fillRect(x, y, w, w);
      // 细对角石纹(很淡,只加质感)
      ctx.strokeStyle = `rgba(255,255,255,0.05)`;
      ctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        const off = (w / 4) * k + ((i * 11 + j * 5) % 9);
        ctx.beginPath();
        ctx.moveTo(x + off, y);
        ctx.lineTo(x, y + off);
        ctx.stroke();
      }
      // 砖块高光内缘(立体感)
      ctx.strokeStyle = `rgba(255,255,255,0.07)`;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);
    }
  }
  dt.update();
  dt.wrapU = Texture.WRAP_ADDRESSMODE;
  dt.wrapV = Texture.WRAP_ADDRESSMODE;
  return dt;
}
