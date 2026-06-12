import earcut from 'earcut';
import { Color3, Mesh, MeshBuilder, Vector3, type PBRMaterial, type Scene } from '@babylonjs/core';
import type { Fixture, TypefaceFontSubset, WallDecorContent } from '../types';
import { emissiveMat, pbr } from '../scene/materialFactory';
import { canvasTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/**
 * 文化墙挂件(wall_decor):贴墙浮雕造型墙,程序化分层挤出,零素材。
 * 三套模板(参考广告公司文化墙版式):
 *  - party_red 党务公开栏:红色异形背板(顶左飘带飞角+波浪底)+ 金边 + 长城线稿 + 缎带栏目板
 *  - blue_tech 厂务公开栏:金属圆角外框 + 白板 + 蓝色斜角饰条 + 六边形栏目签 + 底部双波浪
 *  - honor_red 荣誉墙:红飘带 + 金星 + 红色搁板(带暖光灯带)+ 金色相框阵列 + 落地基座
 *
 * 局部坐标约定(与其他贴墙 builder 一致):正面朝 -Z;墙面在 local z = +d/2
 * (吸附偏移 WALL_T/2 + d/2)。浮雕层以「距墙面偏移 off」描述:背面 z = d/2 - off,
 * 前表面 = 背面 - depth(ExtrudePolygon 旋转后体占 z ∈ [pos - depth, pos])。
 */

type Pt = [number, number]; // [x, 离地高度](米),作画平面 = 墙面

const TPL_DEFAULTS = {
  party_red: {
    title: '党务公开栏',
    panels: ['党内制度文件', '党费收缴情况', '上级最新要求', '通知公告'],
    fontKey: 'serif-bold',
  },
  blue_tech: {
    title: '厂务公开栏',
    panels: ['考核指标', '单车核算', '驾驶员ABC管理', '公告栏', '月度数据图表', '工作动态'],
    fontKey: 'sans-bold',
  },
  honor_red: { title: '荣誉墙', panels: [] as string[], fontKey: 'serif-bold' },
} as const;

type TplKey = keyof typeof TPL_DEFAULTS;

export function wallDecorTemplate(c: WallDecorContent): TplKey {
  return c.template && c.template in TPL_DEFAULTS ? c.template : 'party_red';
}
/** 标题文字(空用模板默认)—— fixtureFactory 取字体子集用 */
export function wallDecorTitleOf(c: WallDecorContent): string {
  return c.title?.trim() || TPL_DEFAULTS[wallDecorTemplate(c)].title;
}
/** 标题字体 key(党务/荣誉=宋体粗,厂务=黑体粗)—— fixtureFactory 取字体子集用 */
export function wallDecorFontKey(c: WallDecorContent): string {
  return TPL_DEFAULTS[wallDecorTemplate(c)].fontKey;
}
/** 栏目名(空用模板默认)—— builder / overlay 共用 */
export function wallDecorPanelsOf(c: WallDecorContent): string[] {
  return c.panels?.length ? c.panels : [...TPL_DEFAULTS[wallDecorTemplate(c)].panels];
}

/* ───────────────────────── 轮廓生成 ───────────────────────── */

/** 圆角矩形轮廓(中心 cx,cy) */
function roundedRect(cx: number, cy: number, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw - 0.01, hh - 0.01);
  const corners: [number, number, number][] = [
    [cx + hw - rr, cy + hh - rr, 0],
    [cx - hw + rr, cy + hh - rr, 90],
    [cx - hw + rr, cy - hh + rr, 180],
    [cx + hw - rr, cy - hh + rr, 270],
  ];
  for (const [ax, ay, a0] of corners) {
    for (let i = 0; i <= 5; i++) {
      const a = ((a0 + (i * 90) / 5) * Math.PI) / 180;
      pts.push([ax + rr * Math.cos(a), ay + rr * Math.sin(a)]);
    }
  }
  return pts;
}

/** 波浪横带(x0→x1,中线 yMid,振幅 amp,带厚 thick,periods 个周期) */
function waveBand(
  x0: number,
  x1: number,
  yMid: number,
  amp: number,
  thick: number,
  periods: number,
  phase = 0,
): Pt[] {
  const N = 40;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = x0 + (x1 - x0) * t;
    const y = yMid + amp * Math.sin(phase + t * periods * 2 * Math.PI);
    top.push([x, y]);
    bot.push([x, y - thick]);
  }
  return [...top, ...bot.reverse()];
}

/** 五角星轮廓 */
function starPts(cx: number, cy: number, r: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

/** 六边形栏目签(左右尖角) */
function hexTab(cx: number, cy: number, w: number, h: number): Pt[] {
  const cut = Math.min(h * 0.55, w * 0.16);
  return [
    [cx - w / 2, cy],
    [cx - w / 2 + cut, cy + h / 2],
    [cx + w / 2 - cut, cy + h / 2],
    [cx + w / 2, cy],
    [cx + w / 2 - cut, cy - h / 2],
    [cx - w / 2 + cut, cy - h / 2],
  ];
}

/** 圆弧飘带(圆心 cx,cy,外半径 R,带厚 thick,角度 a0→a1 弧度) */
function arcBand(cx: number, cy: number, R: number, thick: number, a0: number, a1: number): Pt[] {
  const N = 30;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    outer.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    inner.push([cx + (R - thick) * Math.cos(a), cy + (R - thick) * Math.sin(a)]);
  }
  return [...outer, ...inner.reverse()];
}

/** 水平镜像轮廓(x → -x) */
function mirrorX(pts: Pt[]): Pt[] {
  return pts.map(([x, h]) => [-x, h] as Pt).reverse();
}

/* ───────────────────────── 建模原语 ───────────────────────── */

interface Ctx {
  scene: Scene;
  fx: Fixture;
  root: ReturnType<typeof fixtureRoot>;
  zWall: number; // 墙面 local z(= d/2)
  parts: Mesh[]; // 全部网格(拾取/射灯用)
  n: number; // 网格命名序号
}

/** 浮雕板:轮廓挤出,off=背面距墙面,depth=厚度(向观者凸起) */
function plate(
  ctx: Ctx,
  pts: Pt[],
  depth: number,
  off: number,
  mat: Mesh['material'],
  holes?: Pt[][],
): Mesh {
  const toV = (p: Pt[]) => p.map(([x, h]) => new Vector3(x, 0, -h));
  const mesh = MeshBuilder.ExtrudePolygon(
    `wd:${ctx.fx.id}:${ctx.n++}`,
    { shape: toV(pts), depth, ...(holes?.length ? { holes: holes.map(toV) } : {}) },
    ctx.scene,
    earcut as unknown as Parameters<typeof MeshBuilder.ExtrudePolygon>[3],
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = ctx.zWall - off;
  mesh.material = mat;
  mesh.parent = ctx.root;
  ctx.parts.push(mesh);
  return mesh;
}

/** 方块件(包边条/搁板/基座):中心 (x,yC),背面距墙 off */
function bar(
  ctx: Ctx,
  wM: number,
  hM: number,
  dz: number,
  x: number,
  yC: number,
  off: number,
  mat: Mesh['material'],
): Mesh {
  const b = MeshBuilder.CreateBox(
    `wd:${ctx.fx.id}:${ctx.n++}`,
    { width: wM, height: hM, depth: dz },
    ctx.scene,
  );
  b.position.set(x, yC, ctx.zWall - off - dz / 2);
  b.material = mat;
  b.parent = ctx.root;
  ctx.parts.push(b);
  return b;
}

/** 四边细框(相框/栏目板描边):cx,cy 中心,w×h 外尺寸,t 框宽 */
function borderBoxes(
  ctx: Ctx,
  cx: number,
  cy: number,
  w: number,
  h: number,
  t: number,
  dz: number,
  off: number,
  mat: Mesh['material'],
): void {
  bar(ctx, w, t, dz, cx, cy + h / 2 - t / 2, off, mat);
  bar(ctx, w, t, dz, cx, cy - h / 2 + t / 2, off, mat);
  bar(ctx, t, h - 2 * t, dz, cx - w / 2 + t / 2, cy, off, mat);
  bar(ctx, t, h - 2 * t, dz, cx + w / 2 - t / 2, cy, off, mat);
}

/** 文字标签面(canvas,清晰 DOM 字体):正面位置 = zWall - off - 0.002 */
function labelPlane(
  ctx: Ctx,
  wM: number,
  hM: number,
  x: number,
  y: number,
  off: number,
  draw: (c: CanvasRenderingContext2D, tw: number, th: number) => void,
): Mesh {
  const plane = MeshBuilder.CreatePlane(
    `wd:${ctx.fx.id}:${ctx.n++}`,
    { width: wM, height: hM },
    ctx.scene,
  );
  plane.position.set(x, y, ctx.zWall - off - 0.002);
  const mat = pbr(ctx.scene, `wd-lp:${ctx.fx.id}:${ctx.n}`, { color: Color3.White(), roughness: 0.8 });
  const px = 384;
  const tex = canvasTexture(
    ctx.scene,
    `wd-lt:${ctx.fx.id}:${ctx.n}`,
    px,
    Math.max(48, Math.round((px * hM) / Math.max(wM, 0.05))),
    draw,
  );
  mat.albedoTexture = tex;
  mat.emissiveColor = new Color3(0.14, 0.14, 0.14);
  mat.emissiveTexture = tex;
  plane.material = mat;
  plane.parent = ctx.root;
  ctx.parts.push(plane);
  return plane;
}

/** 挤出标题字:目标字高 targetH,中心 (xC,yC),背面贴在 zWall-off 处;返回实际宽 */
function makeTitle(
  ctx: Ctx,
  text: string,
  fontData: TypefaceFontSubset | null,
  targetH: number,
  xC: number,
  yC: number,
  off: number,
  mat: Mesh['material'],
): { mesh: Mesh; width: number } | null {
  if (!fontData || !text) return null;
  let mesh: Mesh | null = null;
  try {
    mesh = MeshBuilder.CreateText(
      `wd-title:${ctx.fx.id}:${ctx.n++}`,
      text,
      fontData as unknown as Parameters<typeof MeshBuilder.CreateText>[2],
      { size: 1, depth: 0.16, resolution: 4 },
      ctx.scene,
      earcut as unknown as Parameters<typeof MeshBuilder.CreateText>[5],
    );
  } catch (e) {
    console.warn(`[展厅] 文化墙标题挤出失败(${ctx.fx.id}),回退平面字:`, e);
  }
  if (!mesh) return null;
  const bb = mesh.getBoundingInfo().boundingBox;
  const naturalH = bb.maximum.y - bb.minimum.y;
  const s = naturalH > 0.001 ? targetH / naturalH : 1;
  mesh.scaling.setAll(s);
  const cx = (bb.minimum.x + bb.maximum.x) / 2;
  const cy = (bb.minimum.y + bb.maximum.y) / 2;
  // CreateText 字体占 z ∈ [0, depth](正面在 z=0):整体前移 depth,背面贴板
  mesh.position.set(xC - cx * s, yC - cy * s, ctx.zWall - off - 0.16 * s);
  mesh.material = mat;
  mesh.parent = ctx.root;
  ctx.parts.push(mesh);
  return { mesh, width: (bb.maximum.x - bb.minimum.x) * s };
}

/** 标题回退:挤出失败/字体缺失时的平面字;返回占宽 */
function titleFallback(
  ctx: Ctx,
  text: string,
  colorHex: string,
  bgHex: string,
  targetH: number,
  xC: number,
  yC: number,
  off: number,
): number {
  const wM = Math.max(targetH * Math.max(text.length, 2) * 1.1, targetH * 2);
  labelPlane(ctx, wM, targetH * 1.25, xC, yC, off, (c, tw, th) => {
    c.fillStyle = bgHex;
    c.fillRect(0, 0, tw, th);
    c.fillStyle = colorHex;
    c.font = `bold ${Math.round(th * 0.72)}px 'Microsoft YaHei', sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, tw / 2, th / 2 + th * 0.03);
  });
  return wM;
}

/**
 * 压低材质的环境光强度:IBL HDR 有方向性,亮侧墙面会把饱和色(红/蓝)洗成
 * 粉/淡蓝(实测东墙 env=1 红变珊瑚粉、0.45 恢复正红)。彩色件统一钳制,
 * 颜色跨墙面稳定;白板/金属不钳(白色要响应室内光,金属要环境反射)。
 */
function clampEnv(m: PBRMaterial, k: number): PBRMaterial {
  m.environmentIntensity = k;
  return m;
}

/* ───────────────────────── 三套模板 ───────────────────────── */

interface TplArgs {
  ctx: Ctx;
  c: WallDecorContent;
  w: number;
  wallH: number;
  fontData: TypefaceFontSubset | null;
}

/** 党务公开栏:红色异形背板 + 金边 + 长城线稿 + 缎带栏目板 + 底部红绸 */
function buildPartyRed({ ctx, c, w, wallH, fontData }: TplArgs): void {
  const hw = w / 2;
  const BH = Math.min(2.6, wallH - 1.0);
  const y0 = 0.5;
  const y1 = y0 + BH;
  const title = wallDecorTitleOf(c);
  const panels = wallDecorPanelsOf(c).slice(0, 6);

  const matRed = clampEnv(
    pbr(ctx.scene, `wd-red:${ctx.fx.id}`, {
      color: Color3.FromHexString('#C4261D'),
      roughness: 0.5,
      emissive: Color3.FromHexString('#C4261D').scale(0.05), // 微自发光补暗侧墙,亮暗墙红色观感一致
    }),
    0.6,
  );
  const matRedDeep = clampEnv(pbr(ctx.scene, `wd-red2:${ctx.fx.id}`, { color: Color3.FromHexString('#A81A14'), roughness: 0.55 }), 0.6);
  const matGold = pbr(ctx.scene, `wd-gold:${ctx.fx.id}`, {
    color: Color3.FromHexString('#D9B452'),
    metallic: 0.85,
    roughness: 0.32,
    emissive: Color3.FromHexString('#D9B452').scale(0.08),
  });
  const matCream = pbr(ctx.scene, `wd-cream:${ctx.fx.id}`, { color: Color3.FromHexString('#FBF5E9'), roughness: 0.85 });
  const matPanel = pbr(ctx.scene, `wd-panel:${ctx.fx.id}`, { color: Color3.FromHexString('#FFFDF7'), roughness: 0.85 });

  // 红色异形外板轮廓:顶左飘带飞角 + 顶缘微拱 + 波浪底(左下飘尾)
  const outline: Pt[] = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    // 顶边 左→右
    const t = i / N;
    const flare = 0.34 * Math.exp(-(((t - 0.02) / 0.11) ** 2));
    outline.push([-hw + t * w, y1 + flare + 0.04 * Math.sin(Math.PI * t)]);
  }
  outline.push([hw, y1 - 0.05]); // 右上转角
  for (let i = 0; i <= N; i++) {
    // 底边 右→左
    const t = i / N;
    const dip = 0.16 * Math.exp(-(((t - 0.93) / 0.1) ** 2));
    outline.push([hw - t * w, y0 - 0.07 - 0.06 * Math.sin(t * 1.7 * Math.PI + 0.5) - dip]);
  }

  // 内嵌米黄区(挖孔边界)
  const inW = w - 0.46;
  const inH = BH - 0.34;
  const inCy = y0 + 0.17 + inH / 2;

  // L0 米黄底板 → L1 金色细边圈 → L2 红色异形框(浮雕最高)
  plate(ctx, roundedRect(0, inCy, inW + 0.12, inH + 0.12, 0.1), 0.035, 0, matCream);
  plate(ctx, roundedRect(0, inCy, inW + 0.07, inH + 0.07, 0.09), 0.055, 0, matGold, [
    roundedRect(0, inCy, inW - 0.07, inH - 0.07, 0.07),
  ]);
  plate(ctx, outline, 0.075, 0, matRed, [roundedRect(0, inCy, inW, inH, 0.08)]);

  // 米黄面:渐变底 + 长城线稿(整面 canvas,盖在 cream 前)
  labelPlane(ctx, inW - 0.02, inH - 0.02, 0, inCy, 0.037, (g, tw, th) => {
    const grad = g.createLinearGradient(0, 0, 0, th);
    grad.addColorStop(0, '#FCF8EF');
    grad.addColorStop(1, '#F6EDD8');
    g.fillStyle = grad;
    g.fillRect(0, 0, tw, th);
    // 长城剪影(底部,淡红描线)
    g.strokeStyle = 'rgba(178, 44, 36, 0.22)';
    g.lineWidth = 2.5;
    g.beginPath();
    const base = th * 0.9;
    g.moveTo(0, base + 14);
    let xq = 0;
    const seg = tw / 26;
    for (let k = 0; k < 26; k++) {
      const tower = k === 4 || k === 13 || k === 21;
      const hgt = tower ? 26 : 10 + 5 * Math.sin(k * 1.1);
      g.lineTo(xq, base - hgt);
      g.lineTo(xq + (tower ? seg * 0.7 : seg), base - hgt);
      if (!tower) g.lineTo(xq + seg, base - hgt + 5);
      xq += seg;
    }
    g.lineTo(tw, base + 14);
    g.stroke();
    // 远山弧
    g.strokeStyle = 'rgba(178, 44, 36, 0.10)';
    g.lineWidth = 2;
    for (const [mx, mr] of [
      [tw * 0.25, tw * 0.2],
      [tw * 0.7, tw * 0.26],
    ] as const) {
      g.beginPath();
      g.arc(mx, base + mr * 0.92, mr, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    }
  });

  // 标题(红色宋体粗)+ 两侧金星与双线
  const yTitle = y1 - 0.42;
  const made = makeTitle(ctx, title, fontData, 0.34, 0, yTitle, 0.039, matRed);
  const titleW = made ? made.width : titleFallback(ctx, title, '#C4261D', '#FBF5E9', 0.34, 0, yTitle, 0.042);
  for (const sign of [-1, 1]) {
    const sx = sign * (titleW / 2 + 0.32);
    plate(ctx, starPts(sx, yTitle, 0.085), 0.025, 0.039, matGold);
    bar(ctx, 0.4, 0.02, 0.016, sx + sign * 0.42, yTitle + 0.045, 0.039, matGold);
    bar(ctx, 0.3, 0.02, 0.016, sx + sign * 0.37, yTitle - 0.045, 0.039, matGold);
  }

  // 栏目板(单行竖板):米白板 + 金细框 + 红缎带头牌(金背衬)
  const areaX = inW / 2 - 0.18;
  const pTop = yTitle - 0.32;
  const pBot = y0 + 0.46;
  const gap = 0.22;
  const pw = (areaX * 2 - (panels.length - 1) * gap) / panels.length;
  panels.forEach((name, i) => {
    const cx = -areaX + pw / 2 + i * (pw + gap);
    const cy = (pTop + pBot) / 2;
    const ph = pTop - pBot;
    plate(ctx, roundedRect(cx, cy, pw, ph, 0.04), 0.016, 0.038, matPanel);
    borderBoxes(ctx, cx, cy, pw - 0.02, ph - 0.02, 0.016, 0.014, 0.054, matGold);
    const tabW = Math.min(pw * 0.94, 1.4);
    plate(ctx, hexTab(cx, pTop - 0.02, tabW, 0.21), 0.014, 0.046, matGold);
    plate(ctx, hexTab(cx, pTop - 0.02, tabW - 0.05, 0.18), 0.022, 0.052, matRedDeep);
    labelPlane(ctx, Math.max(tabW * 0.8, 0.18), 0.15, cx, pTop - 0.02, 0.076, (g, tw, th) => {
      g.fillStyle = '#A81A14';
      g.fillRect(0, 0, tw, th);
      g.fillStyle = '#FFE9B8';
      g.font = `bold ${Math.round(th * 0.62)}px 'Microsoft YaHei', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, tw / 2, th / 2 + 1);
    });
  });

  // 底部红绸波浪(压在米黄面上)+ 金线
  plate(ctx, waveBand(-inW / 2 + 0.05, inW / 2 - 0.05, y0 + 0.4, 0.06, 0.15, 1.2, 0.6), 0.02, 0.038, matRed);
  plate(ctx, waveBand(-inW / 2 + 0.05, inW / 2 - 0.05, y0 + 0.47, 0.06, 0.018, 1.2, 0.6), 0.014, 0.038, matGold);
}

/** 厂务公开栏:金属圆角框 + 白板 + 蓝斜角饰条 + 六边形栏目签 + 底部双波浪 */
function buildBlueTech({ ctx, c, w, wallH, fontData }: TplArgs): void {
  const BH = Math.min(2.5, wallH - 1.0);
  const y0 = 0.55;
  const yC = y0 + BH / 2;
  const title = wallDecorTitleOf(c);
  const panels = wallDecorPanelsOf(c).slice(0, 8);

  const matBlue = clampEnv(pbr(ctx.scene, `wd-blue:${ctx.fx.id}`, { color: Color3.FromHexString('#1E5FD6'), roughness: 0.45 }), 0.6);
  const matBlueLight = clampEnv(pbr(ctx.scene, `wd-blue2:${ctx.fx.id}`, { color: Color3.FromHexString('#7FA8E8'), roughness: 0.55 }), 0.6);
  const matSilver = pbr(ctx.scene, `wd-silver:${ctx.fx.id}`, { color: Color3.FromHexString('#C9CDD3'), metallic: 0.92, roughness: 0.28 });
  const matBoard = pbr(ctx.scene, `wd-board:${ctx.fx.id}`, { color: Color3.FromHexString('#F5F7FA'), roughness: 0.85 });
  const matWhite = pbr(ctx.scene, `wd-white:${ctx.fx.id}`, { color: Color3.FromHexString('#FFFFFF'), roughness: 0.8 });

  // 金属外框(圆角环)+ 白板
  plate(ctx, roundedRect(0, yC, w, BH, 0.1), 0.07, 0, matSilver, [roundedRect(0, yC, w - 0.13, BH - 0.13, 0.08)]);
  plate(ctx, roundedRect(0, yC, w - 0.1, BH - 0.1, 0.09), 0.03, 0, matBoard);

  // 标题(蓝色黑体粗)
  const yTitle = y0 + BH - 0.34;
  const made = makeTitle(ctx, title, fontData, 0.32, 0, yTitle, 0.032, matBlue);
  const titleW = made ? made.width : titleFallback(ctx, title, '#1E5FD6', '#F5F7FA', 0.32, 0, yTitle, 0.036);

  // 两侧蓝饰条:横条(内端斜切)+ 三道斜杠
  for (const sign of [-1, 1]) {
    const xOut = sign * (w / 2 - 0.22);
    const xIn = sign * (titleW / 2 + 0.58);
    const len = Math.abs(xOut) - Math.abs(xIn);
    if (len > 0.4) {
      const skew = 0.12;
      plate(
        ctx,
        [
          [xOut, yTitle - 0.08],
          [xIn - sign * skew, yTitle - 0.08],
          [xIn, yTitle + 0.08],
          [xOut, yTitle + 0.08],
        ],
        0.018,
        0.032,
        matBlue,
      );
      bar(ctx, len * 0.75, 0.016, 0.012, (xOut + xIn) / 2 - sign * 0.08, yTitle - 0.135, 0.032, matBlueLight);
    }
    // 三道斜杠(贴近标题)
    for (let k = 0; k < 3; k++) {
      const bx = sign * (titleW / 2 + 0.16 + k * 0.12);
      plate(
        ctx,
        [
          [bx - 0.028, yTitle - 0.08],
          [bx + 0.028, yTitle - 0.08],
          [bx + 0.028 + 0.06, yTitle + 0.08],
          [bx - 0.028 + 0.06, yTitle + 0.08],
        ],
        0.016,
        0.032,
        matBlue,
      );
    }
  }

  // 栏目板网格:白板 + 蓝细框 + 六边形蓝签
  const cols = panels.length <= 3 ? Math.max(panels.length, 1) : Math.ceil(panels.length / 2);
  const rows = Math.ceil(panels.length / cols);
  const areaW = w - 0.7;
  const areaTop = yTitle - 0.36;
  const areaBot = y0 + 0.42;
  const gapX = 0.24;
  const gapY = 0.26;
  const pw = (areaW - (cols - 1) * gapX) / cols;
  const ph = (areaTop - areaBot - (rows - 1) * gapY) / rows;
  panels.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = -areaW / 2 + pw / 2 + col * (pw + gapX);
    const cy = areaTop - ph / 2 - row * (ph + gapY);
    plate(ctx, roundedRect(cx, cy, pw, ph, 0.05), 0.012, 0.032, matWhite);
    borderBoxes(ctx, cx, cy, pw - 0.015, ph - 0.015, 0.013, 0.012, 0.044, matBlue);
    const tabW = Math.min(pw * 0.62, 1.3);
    plate(ctx, hexTab(cx, cy + ph / 2, tabW, 0.18), 0.02, 0.044, matBlue);
    labelPlane(ctx, Math.max(tabW * 0.82, 0.18), 0.14, cx, cy + ph / 2, 0.066, (g, tw, th) => {
      g.fillStyle = '#1E5FD6';
      g.fillRect(0, 0, tw, th);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(th * 0.62)}px 'Microsoft YaHei', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, tw / 2, th / 2 + 1);
    });
  });

  // 底部双波浪(浅蓝 + 深蓝错峰)
  const inHW = w / 2 - 0.18;
  plate(ctx, waveBand(-inHW, inHW, y0 + 0.34, 0.05, 0.1, 1.4, 0.2), 0.012, 0.032, matBlueLight);
  plate(ctx, waveBand(-inHW, inHW, y0 + 0.27, 0.05, 0.12, 1.4, 2.2), 0.016, 0.034, matBlue);
}

/** 荣誉墙:红飘带 + 金星 + 红色搁板(暖光灯带)+ 金色相框阵列 + 落地基座 */
function buildHonorRed({ ctx, c, w, wallH, fontData }: TplArgs): void {
  const hw = w / 2;
  const H = Math.min(3.4, wallH - 0.6);
  const rows = Math.min(Math.max(Math.round(c.rows ?? 3), 1), 4);
  const cols = Math.min(Math.max(Math.round(c.cols ?? 5), 2), 7);
  const title = wallDecorTitleOf(c);

  const matRed = clampEnv(
    pbr(ctx.scene, `wd-red:${ctx.fx.id}`, {
      color: Color3.FromHexString('#C4261D'),
      roughness: 0.5,
      emissive: Color3.FromHexString('#C4261D').scale(0.05),
    }),
    0.55,
  );
  const matGold = pbr(ctx.scene, `wd-gold:${ctx.fx.id}`, {
    color: Color3.FromHexString('#D9B452'),
    metallic: 0.85,
    roughness: 0.3,
    emissive: Color3.FromHexString('#D9B452').scale(0.1),
  });
  const matWhite = pbr(ctx.scene, `wd-white:${ctx.fx.id}`, { color: Color3.FromHexString('#FDFBF4'), roughness: 0.85 });
  const matStrip = emissiveMat(ctx.scene, `wd-strip:${ctx.fx.id}`, Color3.FromHexString('#FFD9A0'));

  // 标题 + 两侧 ★★★
  const yTitle = H - 0.32;
  const made = makeTitle(ctx, title, fontData, 0.42, 0, yTitle, 0.02, matRed);
  const titleW = made ? made.width : titleFallback(ctx, title, '#C4261D', '#FFF8EC', 0.42, 0, yTitle, 0.024);
  for (const sign of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const sx = sign * (titleW / 2 + 0.32 + k * 0.24);
      plate(ctx, starPts(sx, yTitle + 0.02, 0.085 - k * 0.014), 0.02, 0.02, matGold);
    }
    // 星后短红飘带(紧贴标题行,不与立式飘带相交)
    const wx0 = sign * (titleW / 2 + 1.05);
    const wx1 = sign * Math.min(titleW / 2 + 2.15, hw - 0.55);
    if (Math.abs(wx1) - Math.abs(wx0) > 0.4) {
      plate(ctx, waveBand(Math.min(wx0, wx1), Math.max(wx0, wx1), yTitle + 0.08, 0.07, 0.085, 0.5, sign < 0 ? Math.PI : 0), 0.022, 0.018, matRed);
    }
  }

  // 两侧立式飘带(左高右低,弧形;顶端压在标题行之下,避免与标题区相交)
  const bladeR = Math.min(H * 0.62, 2.1);
  const bladeCy = yTitle - 0.55 - 0.951 * bladeR; // sin(108°)≈0.951 → 顶端 ≈ yTitle-0.55
  plate(
    ctx,
    arcBand(-hw + 0.05 + bladeR, bladeCy, bladeR, 0.17, (108 * Math.PI) / 180, (196 * Math.PI) / 180),
    0.03,
    0.012,
    matRed,
  );
  const bladeR2 = bladeR * 0.8;
  plate(
    ctx,
    mirrorX(arcBand(-hw + 0.05 + bladeR2, yTitle - 0.95 - 0.951 * bladeR2, bladeR2, 0.13, (112 * Math.PI) / 180, (192 * Math.PI) / 180)),
    0.03,
    0.012,
    matRed,
  );

  // 搁板 + 相框阵列
  const areaTop = yTitle - 0.5;
  const areaBot = 0.42;
  const rowH = (areaTop - areaBot) / rows;
  const shelfW = w - 1.1;
  const frameGap = 0.2;
  const fw = (shelfW - 0.5 - (cols - 1) * frameGap) / cols;
  const fh = Math.min(rowH - 0.26, fw * 0.72);
  for (let r = 0; r < rows; r++) {
    const shelfY = areaBot + r * rowH;
    const shelf = bar(ctx, shelfW, 0.055, 0.2, 0, shelfY, 0, matRed);
    shelf.checkCollisions = true;
    bar(ctx, shelfW - 0.3, 0.022, 0.015, 0, shelfY - 0.045, 0.02, matStrip);
    for (let k = 0; k < cols; k++) {
      const cx = -((cols - 1) * (fw + frameGap)) / 2 + k * (fw + frameGap);
      const cy = shelfY + 0.0275 + 0.02 + fh / 2;
      borderBoxes(ctx, cx, cy, fw, fh, 0.034, 0.035, 0.04, matGold);
      plate(ctx, roundedRect(cx, cy, fw - 0.05, fh - 0.05, 0.01), 0.012, 0.042, matWhite);
    }
  }

  // 落地基座(双级红台)
  const plinth = bar(ctx, w - 0.5, 0.14, 0.3, 0, 0.07, 0, matRed);
  plinth.checkCollisions = true;
  bar(ctx, w - 0.9, 0.1, 0.22, 0, 0.19, 0, matRed);
}

/* ───────────────────────── 入口 ───────────────────────── */

export function buildWallDecor(
  scene: Scene,
  fx: Fixture,
  fonts: Map<string, TypefaceFontSubset>,
  wallH: number,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as WallDecorContent;
  const tpl = wallDecorTemplate(c);
  const fontData = fonts.get(wallDecorFontKey(c)) ?? null;
  const ctx: Ctx = { scene, fx, root, zWall: fx.d / 2, parts: [], n: 0 };
  const args: TplArgs = { ctx, c, w: Math.max(fx.w, tpl === 'honor_red' ? 4.5 : 3.6), wallH, fontData };

  if (tpl === 'blue_tech') buildBlueTech(args);
  else if (tpl === 'honor_red') buildHonorRed(args);
  else buildPartyRed(args);

  // 全部网格可拾取(点哪都能弹详情)。射灯只给两块公开栏(光池落在中央浅色板上);
  // 荣誉墙红件会被射灯洗成粉色(实测),且自带搁板暖光灯带 —— 不配射灯。
  markPickable(ctx.parts, fx);
  return { pickables: ctx.parts, ...(tpl === 'honor_red' ? {} : { spotTargets: ctx.parts }) };
}
