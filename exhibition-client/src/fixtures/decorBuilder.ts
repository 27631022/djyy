import earcut from 'earcut';
import { Color3, MeshBuilder, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import type { DecorContent, Fixture } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { fixtureRoot } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/**
 * 装饰组件(纯氛围):绿植 / 矮盆栽 / 长椅 / 地面引导箭头,程序化建模零素材。
 * 不可点击(不弹详情)、不配射灯 —— 半球光 + IBL 足够。
 */
export function buildDecor(scene: Scene, fx: Fixture, theme: ThemeParams): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const kind = ((fx.source.content ?? {}) as DecorContent).kind ?? 'plant';
  const parts: Mesh[] = [];
  const add = (m: Mesh) => {
    m.parent = root;
    m.isPickable = false;
    parts.push(m);
  };

  if (kind === 'arrow') {
    // 地面引导箭头:平贴地面的多边形(CreatePolygon 直接出 XZ 平面网格),
    // 指向 fixture 正面(局部 -Z);w=长度,d=宽度;点缀色微发光,远处也醒目
    const L = Math.max(fx.w, 0.8);
    const W = Math.max(fx.d, 0.3);
    const sw = W * 0.16; // 杆半宽
    const hw = W * 0.5; // 头半宽
    const hd = Math.min(W * 0.9, L * 0.45); // 头长
    const shape = [
      new Vector3(-sw, 0, L / 2),
      new Vector3(sw, 0, L / 2),
      new Vector3(sw, 0, -L / 2 + hd),
      new Vector3(hw, 0, -L / 2 + hd),
      new Vector3(0, 0, -L / 2),
      new Vector3(-hw, 0, -L / 2 + hd),
      new Vector3(-sw, 0, -L / 2 + hd),
    ];
    const arrow = MeshBuilder.CreatePolygon(
      `guide-arrow:${fx.id}`,
      { shape },
      scene,
      earcut as unknown as Parameters<typeof MeshBuilder.CreatePolygon>[3],
    );
    arrow.position.y = 0.012;
    const mat = pbr(scene, `guide-arrow-mat:${fx.id}`, {
      color: theme.accent,
      roughness: 0.55,
      emissive: theme.accent.scale(0.35),
    });
    arrow.material = mat;
    add(arrow);
    return { pickables: [] };
  }

  if (kind === 'bench') {
    // 长椅:木座面 + 双金属腿
    const woodMat = pbr(scene, `decor-wood:${fx.id}`, {
      color: Color3.FromHexString('#9A7B5B'),
      roughness: 0.65,
    });
    const legMat = pbr(scene, `decor-leg:${fx.id}`, {
      color: Color3.FromHexString('#3A3F47'),
      metallic: 0.7,
      roughness: 0.35,
    });
    const w = Math.max(fx.w, 0.8);
    const d = Math.max(fx.d, 0.4);
    const seat = MeshBuilder.CreateBox(`bench-seat:${fx.id}`, { width: w, height: 0.07, depth: d }, scene);
    seat.position.y = 0.45;
    seat.material = woodMat;
    seat.checkCollisions = true;
    add(seat);
    for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) {
      const leg = MeshBuilder.CreateBox(`bench-leg:${fx.id}:${sx}`, { width: 0.06, height: 0.42, depth: d - 0.08 }, scene);
      leg.position.set(sx, 0.21, 0);
      leg.material = legMat;
      add(leg);
    }
    return { pickables: [] };
  }

  // 绿植(高 plant / 矮 plant_short)
  const potMat = pbr(scene, `decor-pot:${fx.id}`, {
    color: Color3.FromHexString('#EDEAE3'),
    roughness: 0.5,
  });
  const trunkMat = pbr(scene, `decor-trunk:${fx.id}`, {
    color: Color3.FromHexString('#6B4F35'),
    roughness: 0.9,
  });
  const leafMatA = pbr(scene, `decor-leafA:${fx.id}`, {
    color: Color3.FromHexString('#2F7D43'),
    roughness: 0.9,
  });
  const leafMatB = pbr(scene, `decor-leafB:${fx.id}`, {
    color: Color3.FromHexString('#3E9655'),
    roughness: 0.9,
  });

  const tall = kind !== 'plant_short';
  const potH = tall ? 0.42 : 0.3;
  const potD = tall ? 0.46 : 0.5;
  const pot = MeshBuilder.CreateCylinder(
    `plant-pot:${fx.id}`,
    { diameterTop: potD, diameterBottom: potD * 0.78, height: potH, tessellation: 24 },
    scene,
  );
  pot.position.y = potH / 2;
  pot.material = potMat;
  pot.checkCollisions = true;
  add(pot);

  if (tall) {
    const trunk = MeshBuilder.CreateCylinder(
      `plant-trunk:${fx.id}`,
      { diameter: 0.06, height: 0.7, tessellation: 10 },
      scene,
    );
    trunk.position.y = potH + 0.32;
    trunk.material = trunkMat;
    add(trunk);
  }

  // 叶团:错落的压扁球(确定性位置,免随机闪变)
  const clusters: { x: number; y: number; z: number; r: number; b: boolean }[] = tall
    ? [
        { x: 0, y: potH + 0.95, z: 0, r: 0.34, b: false },
        { x: 0.18, y: potH + 0.78, z: 0.1, r: 0.26, b: true },
        { x: -0.16, y: potH + 0.82, z: -0.08, r: 0.24, b: true },
        { x: 0.04, y: potH + 1.18, z: -0.05, r: 0.22, b: false },
      ]
    : [
        { x: 0, y: potH + 0.22, z: 0, r: 0.3, b: false },
        { x: 0.14, y: potH + 0.16, z: 0.1, r: 0.2, b: true },
        { x: -0.13, y: potH + 0.18, z: -0.09, r: 0.19, b: true },
      ];
  clusters.forEach((c, i) => {
    const ball = MeshBuilder.CreateSphere(
      `plant-leaf:${fx.id}:${i}`,
      { diameter: c.r * 2, segments: 10 },
      scene,
    );
    ball.position.set(c.x, c.y, c.z);
    ball.scaling.y = 0.82;
    ball.material = c.b ? leafMatB : leafMatA;
    add(ball);
  });

  return { pickables: [] };
}
