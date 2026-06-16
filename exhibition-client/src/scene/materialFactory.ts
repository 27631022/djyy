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

/**
 * 每材质同时受光上限:顶点着色器 UBO = Scene + Mesh + Material(3 块)+ N 盏灯,
 * 必须 < 显卡 GL_MAX_VERTEX_UNIFORM_BUFFERS(弱办公驱动仅 12)。6 盏 → 9 块,留 3 块余量。
 */
export const MAX_LIGHTS_PER_MATERIAL = 6;

/**
 * 把全场材质的 maxSimultaneousLights 钳回安全上限。
 * ⚠ 必须在 glTF 模型加载完成后调用:@babylonjs/loaders 的 glTFLoader 在 READY 前
 *   会遍历 scene.materials 把每个材质抬到 max(原值, scene.lights.length)(见其源码
 *   「Making sure we enable enough lights」),展厅灯一多就把全场材质(连墙/地板/WebXR)
 *   设成十几盏 → 顶点 UBO 超限 → 着色器编译失败、卡在加载条。我们用 includedOnlyMeshes
 *   控制每网格受光,材质从不需要全场灯,统一钳回即可。
 */
export function clampMaterialLights(scene: Scene, cap = MAX_LIGHTS_PER_MATERIAL): void {
  for (const mat of scene.materials) {
    const m = mat as unknown as { maxSimultaneousLights?: number };
    if (typeof m.maxSimultaneousLights === 'number' && m.maxSimultaneousLights > cap) {
      m.maxSimultaneousLights = cap;
    }
  }
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

export interface FloorTexOpts {
  name?: string;
  /** tile 石材砖(默认)/ tech 发光网格(未来科技风:线亮底黑,可兼作 emissiveTexture) */
  style?: 'tile' | 'tech';
  /** tech 网格线颜色(主题点缀色) */
  lineColor?: Color3;
}

/**
 * 程序化地板纹理(用户反馈纯色「不像地板」):以主题地板色为基调。
 * tile:1m 见方石材砖 —— 每块微明暗差 + 细对角纹理 + 深色砖缝;
 * tech:深底 + 发光网格线(同一张纹理喂 albedo + emissive,线发光底不发光)。
 * DynamicTexture 为 sRGB,PBR albedoTexture 默认按 sRGB 采样,无需手动转线性。
 */
export function makeFloorTexture(scene: Scene, base: Color3, opts: FloorTexOpts = {}): DynamicTexture {
  const SIZE = 512;
  const tilePx = SIZE / FLOOR_TEX_TILES;
  const dt = new DynamicTexture(opts.name ?? 'tex:floor', SIZE, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const [r, g, b] = [base.r * 255, base.g * 255, base.b * 255];
  const shade = (f: number) => `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;

  if (opts.style === 'tech') {
    const lc = opts.lineColor ?? new Color3(0, 0.83, 1);
    const line = (a: number) =>
      `rgba(${Math.round(lc.r * 255)}, ${Math.round(lc.g * 255)}, ${Math.round(lc.b * 255)}, ${a})`;
    // 深底(微渐变防死黑)
    ctx.fillStyle = shade(1);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < FLOOR_TEX_TILES; i++) {
      for (let j = 0; j < FLOOR_TEX_TILES; j++) {
        const f = 0.9 + (((i * 7 + j * 13) % 5) / 5) * 0.25;
        ctx.fillStyle = shade(f);
        ctx.fillRect(i * tilePx + 1, j * tilePx + 1, tilePx - 2, tilePx - 2);
      }
    }
    // 次级细网格(0.25m,很淡)
    ctx.strokeStyle = line(0.10);
    ctx.lineWidth = 1;
    for (let k = 0; k <= SIZE; k += tilePx / 4) {
      ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(SIZE, k); ctx.stroke();
    }
    // 主网格(1m,发光主体:外晕 + 亮芯)
    for (let k = 0; k <= SIZE; k += tilePx) {
      ctx.strokeStyle = line(0.28);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(SIZE, k); ctx.stroke();
      ctx.strokeStyle = line(0.95);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(SIZE, k); ctx.stroke();
    }
    // 交点亮斑(科技感节点)
    ctx.fillStyle = line(1);
    for (let i = 0; i <= FLOOR_TEX_TILES; i++) {
      for (let j = 0; j <= FLOOR_TEX_TILES; j++) {
        ctx.beginPath();
        ctx.arc(i * tilePx, j * tilePx, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    dt.update();
    dt.wrapU = Texture.WRAP_ADDRESSMODE;
    dt.wrapV = Texture.WRAP_ADDRESSMODE;
    return dt;
  }

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
