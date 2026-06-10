import {
  Color3,
  Mesh,
  MeshBuilder,
  SpotLight,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import type { Fixture } from '../types';
import type { ThemeParams } from '../theme/presets';

export const DEG = Math.PI / 180;

/**
 * fixture 根节点:position=(x,0,y 平面→z),rotation.y=-rot。
 * 约定:局部空间「正面朝 -Z」,rot=0 时正面朝平面图 -Y。
 */
export function fixtureRoot(scene: Scene, fx: Fixture): TransformNode {
  const root = new TransformNode(`fx:${fx.id}`, scene);
  root.position.set(fx.x, 0, fx.y);
  root.rotation.y = -fx.rot * DEG;
  return root;
}

/** 注册可拾取:点击 → overlay 详情 */
export function markPickable(meshes: Mesh[], fx: Fixture): void {
  for (const m of meshes) {
    m.isPickable = true;
    m.metadata = { fixture: fx };
  }
}

export interface SpotOpts {
  wallH: number;
  floor: Mesh;
  targets: Mesh[]; // 光只作用这些网格 + 地板(防超 maxSimultaneousLights)
}

/** 展品射灯 + 假体积光锥(美术包:吊顶向展品打暖光,地面留光池) */
export function addSpotFor(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
  opts: SpotOpts,
): { cone: Mesh } {
  const fxDirX = Math.sin(fx.rot * DEG);
  const fxDirZ = -Math.cos(fx.rot * DEG);
  const px = fx.x + fxDirX * 0.95;
  const pz = fx.y + fxDirZ * 0.95;

  const pos = new Vector3(px, opts.wallH - 0.28, pz);
  const target = new Vector3(fx.x, 1.3, fx.y);
  const dir = target.subtract(pos).normalize();
  const spot = new SpotLight(`spot:${fx.id}`, pos, dir, 1.2, 16, scene);
  spot.intensity = theme.spotIntensity;
  spot.range = opts.wallH + 5;
  spot.diffuse = new Color3(1, 0.97, 0.9);
  spot.specular = new Color3(0.4, 0.39, 0.36);
  spot.includedOnlyMeshes = [...opts.targets, opts.floor];

  const coneH = opts.wallH - 1.5;
  const cone = MeshBuilder.CreateCylinder(
    `cone:${fx.id}`,
    {
      diameterTop: 0.22,
      diameterBottom: 1.9,
      height: coneH,
      tessellation: 24,
      cap: Mesh.NO_CAP,
    },
    scene,
  );
  cone.position.set(px, opts.wallH - 0.3 - coneH / 2, pz);
  const cmat = new StandardMaterial(`cone-mat:${fx.id}`, scene);
  cmat.emissiveColor = new Color3(1, 0.95, 0.82);
  cmat.alpha = 0.045;
  cmat.disableLighting = true;
  cmat.backFaceCulling = false;
  cone.material = cmat;
  cone.isPickable = false;
  return { cone };
}
