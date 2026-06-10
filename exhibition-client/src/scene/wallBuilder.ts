import { Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { HallMeta, Wall } from '../types';
import type { ThemeParams } from '../theme/presets';
import { emissiveMat, pbr } from './materialFactory';

export interface HallShell {
  floor: Mesh;
  wallH: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** 静态网格(收尾统一 freezeWorldMatrix) */
  staticMeshes: Mesh[];
}

const WALL_T = 0.2; // 墙厚(米)

/**
 * 空间外壳:墙体(碰撞)+ 踢脚线/顶角线 + 反光地板 + 发光格栅吊顶。
 * 坐标:平面图 (x,y) → 三维 (x, z);墙段为带朝向的薄盒。
 */
export function buildShell(
  scene: Scene,
  walls: Wall[],
  meta: HallMeta,
  theme: ThemeParams,
): HallShell {
  const wallH = meta.wallH ?? 4.2;
  const staticMeshes: Mesh[] = [];

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
    color: theme.floor,
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

  // ── 地板 ──
  const floor = MeshBuilder.CreateGround(
    'floor',
    { width: spanX + WALL_T * 2, height: spanZ + WALL_T * 2 },
    scene,
  );
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

  // ── 墙体 + 踢脚线 + 顶角线 ──
  const trims: Mesh[] = [];
  walls.forEach((w, i) => {
    const dx = w.x2 - w.x1;
    const dz = w.y2 - w.y1;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const mx = (w.x1 + w.x2) / 2;
    const mz = (w.y1 + w.y2) / 2;
    const rotY = -Math.atan2(dz, dx); // 盒宽沿 +X,转到墙段方向

    const wall = MeshBuilder.CreateBox(
      `wall:${w.id ?? i}`,
      { width: len, height: wallH, depth: WALL_T },
      scene,
    );
    wall.position.set(mx, wallH / 2, mz);
    wall.rotation.y = rotY;
    wall.material = wallMat;
    wall.checkCollisions = true;
    wall.isPickable = false;
    staticMeshes.push(wall);

    // 踢脚线(双面凸出)
    const skirt = MeshBuilder.CreateBox(
      `skirt:${i}`,
      { width: len + 0.02, height: 0.12, depth: WALL_T + 0.06 },
      scene,
    );
    skirt.position.set(mx, 0.06, mz);
    skirt.rotation.y = rotY;
    skirt.material = trimMat;
    skirt.isPickable = false;
    trims.push(skirt);

    // 顶角线
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
