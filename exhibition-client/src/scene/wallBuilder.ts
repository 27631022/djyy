import { Color3, Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { Fixture, HallMeta, Wall } from '../types';
import type { ThemeParams } from '../theme/presets';
import { FLOOR_TEX_TILES, emissiveMat, makeFloorTexture, pbr } from './materialFactory';

export interface HallShell {
  floor: Mesh;
  wallH: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** 静态网格(收尾统一 freezeWorldMatrix) */
  staticMeshes: Mesh[];
}

const WALL_T = 0.2; // 墙厚(米)
const DOOR_CLEAR_H = 2.5; // 门洞净高(= doorBuilder 门套梁底),其上补过梁墙体

/** 墙段被门洞切开后的实体区间(沿墙方向的 [起,止] 米) */
function solidSpans(wall: Wall, doors: Fixture[]): { spans: [number, number][]; openings: [number, number][] } {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return { spans: [], openings: [] };
  const ux = dx / len;
  const uy = dy / len;

  const openings: [number, number][] = [];
  for (const door of doors) {
    const relX = door.x - wall.x1;
    const relY = door.y - wall.y1;
    const t = relX * ux + relY * uy; // 沿墙投影
    const perp = Math.abs(-relX * uy + relY * ux); // 垂距
    if (perp > 0.4 || t < -0.05 || t > len + 0.05) continue; // 不在这面墙上
    const a = Math.max(0, t - door.w / 2);
    const b = Math.min(len, t + door.w / 2);
    if (b - a > 0.1) openings.push([a, b]);
  }
  openings.sort((p, q) => p[0] - q[0]);
  // 合并重叠门洞
  const merged: [number, number][] = [];
  for (const o of openings) {
    const last = merged[merged.length - 1];
    if (last && o[0] <= last[1] + 0.01) last[1] = Math.max(last[1], o[1]);
    else merged.push([...o] as [number, number]);
  }
  const spans: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a - cursor > 0.05) spans.push([cursor, a]);
    cursor = b;
  }
  if (len - cursor > 0.05) spans.push([cursor, len]);
  return { spans, openings: merged };
}

/**
 * 空间外壳:墙体(碰撞,**door 组件处自动留门洞 + 过梁**)+ 踢脚线/顶角线 +
 * 砖纹反光地板 + 发光格栅吊顶。坐标:平面图 (x,y) → 三维 (x, z);墙段为带朝向的薄盒。
 */
export function buildShell(
  scene: Scene,
  walls: Wall[],
  meta: HallMeta,
  theme: ThemeParams,
  fixtures: Fixture[] = [],
): HallShell {
  const wallH = meta.wallH ?? 4.2;
  const staticMeshes: Mesh[] = [];
  const doors = fixtures.filter((f) => f.type === 'door');

  // 包围盒(地板/吊顶覆盖范围)
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.x1, w.x2);
    maxX = Math.max(maxX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  if (!isFinite(minX)) {
    minX = -10;
    maxX = 10;
    minY = -10;
    maxY = 10;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;
  const spanX = maxX - minX;
  const spanZ = maxY - minY;

  // ── 材质 ──
  const wallMat = pbr(scene, 'mat:wall', {
    color: theme.wall,
    roughness: theme.wallRoughness,
  });
  wallMat.maxSimultaneousLights = 12; // 展品射灯会打到墙
  const floorMat = pbr(scene, 'mat:floor', {
    color: Color3.White(), // 基色烤进砖纹贴图,albedo 给白(相乘不偏色)
    roughness: theme.floorRoughness, // 低粗糙度 → IBL 反射,「反光地板」
    metallic: 0.05,
  });
  floorMat.maxSimultaneousLights = 12; // 射灯地面光池
  const trimMat = pbr(scene, 'mat:trim', { color: theme.trim, roughness: 0.5, metallic: 0.3 });
  // 吊顶面朝下,光照天然不足 → 补少量自发光(过高会让全场发亮,0.22 时用户反馈偏亮)
  const ceilMat = pbr(scene, 'mat:ceiling', {
    color: theme.ceiling,
    roughness: 0.95,
    emissive: theme.ceiling.scale(0.13),
  });
  const beamMat = pbr(scene, 'mat:beam', {
    color: theme.beam,
    roughness: 0.8,
    emissive: theme.beam.scale(0.08),
  });
  const stripMat = emissiveMat(scene, 'mat:strip', theme.stripEmissive);

  // ── 地板(程序化砖纹:1m 砖 + 缝 + 微明暗,治「纯色不像地板」) ──
  const floorW = spanX + WALL_T * 2;
  const floorD = spanZ + WALL_T * 2;
  const floorTex = makeFloorTexture(scene, theme.floor);
  floorTex.uScale = floorW / FLOOR_TEX_TILES; // 1 砖 = 1m
  floorTex.vScale = floorD / FLOOR_TEX_TILES;
  floorMat.albedoTexture = floorTex;
  const floor = MeshBuilder.CreateGround('floor', { width: floorW, height: floorD }, scene);
  floor.position.set(cx, 0, cz);
  floor.material = floorMat;
  floor.checkCollisions = true;
  floor.isPickable = false;
  staticMeshes.push(floor);

  // ── 吊顶基板(薄盒,下表面可见) ──
  const ceil = MeshBuilder.CreateBox(
    'ceiling',
    { width: spanX + WALL_T * 2, height: 0.06, depth: spanZ + WALL_T * 2 },
    scene,
  );
  ceil.position.set(cx, wallH + 0.03, cz);
  ceil.material = ceilMat;
  ceil.isPickable = false;
  staticMeshes.push(ceil);

  // ── 墙体(door 处留洞)+ 踢脚线 + 顶角线 ──
  const trims: Mesh[] = [];
  walls.forEach((w, i) => {
    const dx = w.x2 - w.x1;
    const dz = w.y2 - w.y1;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const ux = dx / len;
    const uz = dz / len;
    const rotY = -Math.atan2(dz, dx); // 盒宽沿 +X,转到墙段方向
    /** 沿墙 t 米处的世界坐标 */
    const at = (t: number) => ({ x: w.x1 + ux * t, z: w.y1 + uz * t });

    const { spans, openings } = solidSpans(w, doors);

    // 实体段(全高,带碰撞)+ 各段踢脚线
    spans.forEach(([a, b], k) => {
      const segLen = b - a;
      const c = at((a + b) / 2);
      const wall = MeshBuilder.CreateBox(
        `wall:${w.id ?? i}:${k}`,
        { width: segLen, height: wallH, depth: WALL_T },
        scene,
      );
      wall.position.set(c.x, wallH / 2, c.z);
      wall.rotation.y = rotY;
      wall.material = wallMat;
      wall.checkCollisions = true;
      wall.isPickable = false;
      staticMeshes.push(wall);

      const skirt = MeshBuilder.CreateBox(
        `skirt:${i}:${k}`,
        { width: segLen + 0.02, height: 0.12, depth: WALL_T + 0.06 },
        scene,
      );
      skirt.position.set(c.x, 0.06, c.z);
      skirt.rotation.y = rotY;
      skirt.material = trimMat;
      skirt.isPickable = false;
      trims.push(skirt);
    });

    // 门洞过梁:净高之上补墙到顶(人能走过,墙体仍连续)
    openings.forEach(([a, b], k) => {
      if (wallH - DOOR_CLEAR_H < 0.05) return;
      const c = at((a + b) / 2);
      const lintel = MeshBuilder.CreateBox(
        `wall-lintel:${w.id ?? i}:${k}`,
        { width: b - a + 0.02, height: wallH - DOOR_CLEAR_H, depth: WALL_T },
        scene,
      );
      lintel.position.set(c.x, DOOR_CLEAR_H + (wallH - DOOR_CLEAR_H) / 2, c.z);
      lintel.rotation.y = rotY;
      lintel.material = wallMat;
      lintel.checkCollisions = true;
      lintel.isPickable = false;
      staticMeshes.push(lintel);
    });

    // 顶角线(整墙通长;门洞上方有过梁,视觉连续)
    const mx = (w.x1 + w.x2) / 2;
    const mz = (w.y1 + w.y2) / 2;
    const cornice = MeshBuilder.CreateBox(
      `cornice:${i}`,
      { width: len + 0.02, height: 0.1, depth: WALL_T + 0.04 },
      scene,
    );
    cornice.position.set(mx, wallH - 0.05, mz);
    cornice.rotation.y = rotY;
    cornice.material = trimMat;
    cornice.isPickable = false;
    trims.push(cornice);
  });
  const mergedTrim = Mesh.MergeMeshes(trims, true, true, undefined, false, false);
  if (mergedTrim) {
    mergedTrim.name = 'trims';
    mergedTrim.isPickable = false;
    staticMeshes.push(mergedTrim);
  }

  // ── 发光格栅吊顶:梁阵列 + 灯带 ──
  const beams: Mesh[] = [];
  const strips: Mesh[] = [];
  const beamGap = 2.0;
  const beamH = 0.22;
  const beamY = wallH - beamH / 2;
  // 沿 X 方向的横梁(排布在 Z 轴)
  for (let z = minY + beamGap; z < maxY - 0.3; z += beamGap) {
    const b = MeshBuilder.CreateBox(
      `beamx`,
      { width: spanX - 0.2, height: beamH, depth: 0.14 },
      scene,
    );
    b.position.set(cx, beamY, z);
    beams.push(b);
  }
  // 沿 Z 方向的纵梁(排布在 X 轴)
  for (let x = minX + beamGap; x < maxX - 0.3; x += beamGap) {
    const b = MeshBuilder.CreateBox(
      `beamz`,
      { width: 0.14, height: beamH, depth: spanZ - 0.2 },
      scene,
    );
    b.position.set(x, beamY, cz);
    beams.push(b);
  }
  // 灯带:沿 X 方向,每隔一格嵌在格栅之间(自发光,GlowLayer 拾取)
  let stripRow = 0;
  for (let z = minY + beamGap / 2; z < maxY - 0.3; z += beamGap) {
    if (stripRow++ % 2 === 0) {
      const s = MeshBuilder.CreateBox(
        `strip`,
        { width: spanX - 1.2, height: 0.04, depth: 0.12 },
        scene,
      );
      s.position.set(cx, wallH - 0.04, z);
      strips.push(s);
    }
  }
  const mergedBeams = Mesh.MergeMeshes(beams, true, true, undefined, false, false);
  if (mergedBeams) {
    mergedBeams.name = 'ceilingBeams';
    mergedBeams.material = beamMat;
    mergedBeams.isPickable = false;
    staticMeshes.push(mergedBeams);
  }
  const mergedStrips = Mesh.MergeMeshes(strips, true, true, undefined, false, false);
  if (mergedStrips) {
    mergedStrips.name = 'lightStrips';
    mergedStrips.material = stripMat;
    mergedStrips.isPickable = false;
    staticMeshes.push(mergedStrips);
  }

  return { floor, wallH, bounds: { minX, maxX, minY, maxY }, staticMeshes };
}
