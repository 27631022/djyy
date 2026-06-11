import {
  Color3,
  Mesh,
  MeshBuilder,
  SceneLoader,
  type Scene,
} from '@babylonjs/core';
import type { Fixture, ModelStandContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { emissiveMat, glassMat, pbr } from '../scene/materialFactory';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/**
 * 模型台:展台底座 + .glb 模型(model3d 产物/手动上传)或「悬浮晶体」占位。
 * glb 异步加载(URL 无扩展名 → pluginExtension 指定 .glb),失败回落占位。
 */
export function buildModelStand(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as ModelStandContent;

  const pedestal = MeshBuilder.CreateCylinder(
    `stand-pedestal:${fx.id}`,
    { diameter: 0.62, height: 0.95, tessellation: 48 },
    scene,
  );
  pedestal.position.set(0, 0.475, 0);
  pedestal.material = pbr(scene, `stand-pedestal-mat:${fx.id}`, {
    color: Color3.FromHexString('#E8E5E0'),
    roughness: 0.4,
  });
  pedestal.parent = root;

  const top = MeshBuilder.CreateCylinder(
    `stand-top:${fx.id}`,
    { diameter: 0.72, height: 0.05, tessellation: 48 },
    scene,
  );
  top.position.set(0, 0.975, 0);
  top.material = pbr(scene, `stand-top-mat:${fx.id}`, {
    color: theme.trim,
    metallic: 0.6,
    roughness: 0.3,
  });
  top.parent = root;

  // 精致细节:底部发光环(点缀色,GlowLayer 拾取)+ 台面下灯线环
  const mkRing = (diameter: number, y: number, thick: number) => {
    const ring = MeshBuilder.CreateTorus(
      `stand-ring:${fx.id}:${y}`,
      { diameter, thickness: thick, tessellation: 48 },
      scene,
    );
    ring.position.set(0, y, 0);
    ring.material = emissiveMat(scene, `stand-ring-mat:${fx.id}:${y}`, theme.accent.scale(0.85));
    ring.isPickable = false;
    ring.parent = root;
  };
  mkRing(0.7, 0.02, 0.025); // 底部光环
  mkRing(0.66, 0.945, 0.018); // 台面下灯线

  // 玻璃罩(圆柱,罩住展品;微透反光,精致感)
  const dome = MeshBuilder.CreateCylinder(
    `stand-dome:${fx.id}`,
    { diameter: 0.74, height: 0.92, tessellation: 48 },
    scene,
  );
  dome.position.set(0, 1.0 + 0.46, 0);
  dome.material = glassMat(scene, `stand-dome-mat:${fx.id}`);
  dome.isPickable = false;
  dome.parent = root;

  const pickables: Mesh[] = [pedestal, top];

  const placePlaceholder = () => {
    const crystal = MeshBuilder.CreatePolyhedron(
      `stand-crystal:${fx.id}`,
      { type: 3, size: 0.24 },
      scene,
    );
    crystal.position.set(0, 1.5, 0);
    crystal.material = pbr(scene, `stand-crystal-mat:${fx.id}`, {
      color: theme.accent,
      metallic: 0.85,
      roughness: 0.22,
      emissive: theme.accent.scale(0.12),
    });
    crystal.parent = root;
    markPickable([crystal], fx);
    let t = 0;
    scene.registerBeforeRender(() => {
      t += scene.getEngine().getDeltaTime() / 1000;
      crystal.rotation.y = t * 0.6;
      crystal.position.y = 1.5 + Math.sin(t * 1.2) * 0.05;
    });
  };

  if (c.modelUrl) {
    SceneLoader.LoadAssetContainerAsync('', c.modelUrl, scene, undefined, '.glb')
      .then((container) => {
        container.addAllToScene();
        const nodes = container.meshes.filter((m) => !m.parent);
        for (const n of nodes) n.parent = root;
        // 归一:包进 0.85m 立方,坐到台面上
        const { min, max } = root.getHierarchyBoundingVectors(true);
        const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
        const s = (0.85 / size) * (c.scale ?? 1);
        for (const n of nodes) {
          n.scaling.scaleInPlace(s);
          n.position.y += 1.0 - min.y * s;
        }
        const meshes = container.meshes.filter((m): m is Mesh => m instanceof Mesh);
        markPickable(meshes, fx);
        if (c.autorotate !== false) {
          let t = 0;
          scene.registerBeforeRender(() => {
            t += scene.getEngine().getDeltaTime() / 1000;
            for (const n of nodes) n.rotation.y = t * 0.5;
          });
        }
      })
      .catch((e) => {
        console.warn(`[展厅] 模型加载失败(${fx.id}):`, e);
        placePlaceholder();
      });
  } else {
    placePlaceholder();
  }

  markPickable(pickables, fx);
  return { pickables, spotTargets: pickables };
}
