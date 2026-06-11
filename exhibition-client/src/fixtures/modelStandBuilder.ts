import {
  Color3,
  Mesh,
  MeshBuilder,
  SceneLoader,
  TransformNode,
  type Scene,
} from '@babylonjs/core';
import type { Fixture, ModelStandContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { emissiveMat, glassMat, pbr } from '../scene/materialFactory';
import { fixtureRoot, markPickable } from './fixtureUtils';
import { canvasTexture, wrapCjk } from './placeholder';
import type { BuiltFixture } from './imageCaseBuilder';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 模型台:台身(圆形/长方形,台面长宽=fixture.w/d、台面高=content.standH)+ 玻璃罩
 * + .glb/.gltf 模型(无模型时「悬浮晶体」占位)+ 可选台旁介绍牌(content.intro)。
 *
 * 模型加载要点(都是踩过的坑):
 *  - rootUrl 用素材口的 `…/:id/rel/`、主文件名 `__self__` —— 模型 JSON 里的相对贴图
 *    uri(glb 外链散图)会落到同一 /rel/ 路由按文件名解析;缺图后端回 1×1 白图,
 *    不再因单张贴图 404 整模加载失败。
 *  - 包围盒只量模型自身(createRootMesh 后、挂上 root 前),不能用 root 整体
 *    (会把台身/玻璃罩算进去 → 小模型永远不被放大,看起来"不显示")。
 *  - 自转要转外层 holder:glTF __root__ 带 rotationQuaternion,直接设 .rotation 无效。
 */
export function buildModelStand(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as ModelStandContent;

  const shape: 'round' | 'rect' = c.shape === 'rect' ? 'rect' : 'round';
  const w = clamp(fx.w || 1.2, 0.4, 6);
  const d = clamp(fx.d || 1.2, 0.4, 6);
  // 台面尺寸:圆台取 w/d 较小者为直径,方台即 w×d
  const plateW = shape === 'round' ? Math.min(w, d) : w;
  const plateD = shape === 'round' ? Math.min(w, d) : d;
  const standH = clamp(c.standH ?? 1.0, 0.3, 1.6); // 台面(顶面)离地高度
  const colH = standH - 0.05; // 柱身,上面还有 0.05 台板
  const maxModelH = clamp(Math.min(plateW, plateD) + 0.2, 0.6, 2.2);

  /* ── 台身 ── */
  const mkBody = (name: string, bw: number, bd: number, h: number): Mesh =>
    shape === 'round'
      ? MeshBuilder.CreateCylinder(name, { diameter: Math.min(bw, bd), height: h, tessellation: 48 }, scene)
      : MeshBuilder.CreateBox(name, { width: bw, depth: bd, height: h }, scene);

  const colW = plateW - 0.12;
  const colD = plateD - 0.12;
  const pedestal = mkBody(`stand-pedestal:${fx.id}`, colW, colD, colH);
  pedestal.position.set(0, colH / 2, 0);
  pedestal.material = pbr(scene, `stand-pedestal-mat:${fx.id}`, {
    color: Color3.FromHexString('#E8E5E0'),
    roughness: 0.4,
  });
  pedestal.parent = root;

  const top = mkBody(`stand-top:${fx.id}`, plateW, plateD, 0.05);
  top.position.set(0, standH - 0.025, 0);
  top.material = pbr(scene, `stand-top-mat:${fx.id}`, {
    color: theme.trim,
    metallic: 0.6,
    roughness: 0.3,
  });
  top.parent = root;

  // 精致细节:底部发光圈 + 台面下灯线(圆台用环,方台用薄发光板,GlowLayer 拾取)
  const mkGlow = (name: string, gw: number, gd: number, y: number, thick: number) => {
    const m =
      shape === 'round'
        ? MeshBuilder.CreateTorus(name, { diameter: Math.min(gw, gd), thickness: thick, tessellation: 48 }, scene)
        : MeshBuilder.CreateBox(name, { width: gw, depth: gd, height: thick * 0.7 }, scene);
    m.position.set(0, y, 0);
    m.material = emissiveMat(scene, `${name}-mat`, theme.accent.scale(0.85));
    m.isPickable = false;
    m.parent = root;
  };
  mkGlow(`stand-ring:${fx.id}:base`, colW + 0.08, colD + 0.08, 0.02, 0.025);
  mkGlow(`stand-ring:${fx.id}:top`, colW + 0.04, colD + 0.04, standH - 0.06, 0.018);

  // 玻璃罩(罩住展品区;微透反光)
  const domeH = maxModelH + 0.12;
  const dome =
    shape === 'round'
      ? MeshBuilder.CreateCylinder(`stand-dome:${fx.id}`, { diameter: Math.min(plateW, plateD) + 0.12, height: domeH, tessellation: 48 }, scene)
      : MeshBuilder.CreateBox(`stand-dome:${fx.id}`, { width: plateW + 0.12, depth: plateD + 0.12, height: domeH }, scene);
  dome.position.set(0, standH + domeH / 2, 0);
  dome.material = glassMat(scene, `stand-dome-mat:${fx.id}`);
  dome.isPickable = false;
  dome.parent = root;

  const pickables: Mesh[] = [pedestal, top];

  /* ── 介绍牌(讲台式斜面,正前右侧;intro 非空才建) ── */
  if (c.intro?.trim()) {
    buildIntroCard(scene, fx, root, theme, {
      x: plateW / 2 + 0.34,
      z: -plateD / 2,
      title: fx.label ?? '展品介绍',
      intro: c.intro.trim(),
      pickables,
    });
  }

  /* ── 展品:glb/gltf 或占位晶体 ── */
  const placePlaceholder = () => {
    const crystal = MeshBuilder.CreatePolyhedron(
      `stand-crystal:${fx.id}`,
      { type: 3, size: 0.24 },
      scene,
    );
    crystal.position.set(0, standH + 0.5, 0);
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
      crystal.position.y = standH + 0.5 + Math.sin(t * 1.2) * 0.05;
    });
  };

  if (c.modelUrl) {
    const ext = c.modelName?.toLowerCase().endsWith('.gltf') ? '.gltf' : '.glb';
    SceneLoader.LoadAssetContainerAsync(`${c.modelUrl}/rel/`, '__self__', scene, undefined, ext)
      .then((container) => {
        container.addAllToScene();
        const modelRoot = container.createRootMesh();
        // z-up 模型摆正(横倒):先转再量包围盒,后续贴台面/居中算式不变
        if (c.upAxis === 'z') {
          modelRoot.rotation.x = -Math.PI / 2;
          modelRoot.computeWorldMatrix(true);
        }
        // 量模型自身包围盒(此刻尚未挂 root,世界系=模型系)
        const { min, max } = modelRoot.getHierarchyBoundingVectors(true);
        const sx = max.x - min.x || 1;
        const sy = max.y - min.y || 1;
        const sz = max.z - min.z || 1;
        const s =
          Math.min((plateW + 0.1) / sx, maxModelH / sy, (plateD + 0.1) / sz) *
          (c.scale ?? 1);
        // holder 在台面中心做自转;modelRoot 在内偏移,让模型水平居中、底面落台面
        const holder = new TransformNode(`stand-model:${fx.id}`, scene);
        holder.parent = root;
        holder.position.y = standH;
        modelRoot.parent = holder;
        modelRoot.scaling.setAll(s);
        modelRoot.position.set(
          -((min.x + max.x) / 2) * s,
          -min.y * s,
          -((min.z + max.z) / 2) * s,
        );
        markPickable(container.meshes.filter((m): m is Mesh => m instanceof Mesh), fx);
        if (c.autorotate !== false) {
          let t = 0;
          scene.registerBeforeRender(() => {
            t += scene.getEngine().getDeltaTime() / 1000;
            holder.rotation.y = t * 0.5;
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
  return { pickables, spotTargets: [pedestal, top] };
}

/* ── 台旁介绍牌:金属斜杆 + 白面板(标题 + 折行介绍文字) ── */
function buildIntroCard(
  scene: Scene,
  fx: Fixture,
  root: TransformNode,
  theme: ThemeParams,
  o: { x: number; z: number; title: string; intro: string; pickables: Mesh[] },
): void {
  const CARD_W = 0.52;
  const CARD_H = 0.38;
  const TILT = 0.6; // 面板上沿后仰(弧度),面朝上前方便于阅读

  const pole = MeshBuilder.CreateBox(
    `stand-card-pole:${fx.id}`,
    { width: 0.05, height: 0.72, depth: 0.05 },
    scene,
  );
  pole.position.set(o.x, 0.36, o.z);
  pole.material = pbr(scene, `stand-card-pole-mat:${fx.id}`, {
    color: Color3.FromHexString('#5A5C60'),
    metallic: 0.7,
    roughness: 0.35,
  });
  pole.parent = root;

  // 背板(深色)+ 内容面(白,canvas 文字),同倾角;单面避免镜像
  const back = MeshBuilder.CreateBox(
    `stand-card-back:${fx.id}`,
    { width: CARD_W + 0.04, height: CARD_H + 0.04, depth: 0.02 },
    scene,
  );
  back.position.set(o.x, 0.84, o.z);
  back.rotation.x = TILT;
  back.material = pbr(scene, `stand-card-back-mat:${fx.id}`, {
    color: Color3.FromHexString('#3A3C40'),
    metallic: 0.5,
    roughness: 0.45,
  });
  back.parent = root;

  const panel = MeshBuilder.CreatePlane(
    `stand-card:${fx.id}`,
    { width: CARD_W, height: CARD_H },
    scene,
  );
  // 沿面板法向抬出 12mm,避免与背板 z-fighting
  panel.position.set(o.x, 0.84 + Math.sin(TILT) * 0.012, o.z - Math.cos(TILT) * 0.012);
  panel.rotation.x = TILT;
  const mat = pbr(scene, `stand-card-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.8,
  });
  const accentHex = theme.accent.toHexString();
  mat.albedoTexture = canvasTexture(scene, `stand-card-tex:${fx.id}`, 640, 468, (ctx, tw, th) => {
    ctx.fillStyle = '#FDFDFB';
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, tw, 8);
    ctx.fillRect(36, 38, 8, 44);
    ctx.fillStyle = '#26262b';
    ctx.font = `bold 44px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(o.title.slice(0, 12), 58, 38);
    ctx.fillStyle = '#44454c';
    ctx.font = `30px 'Microsoft YaHei', sans-serif`;
    const lines = wrapCjk(ctx, o.intro, tw - 76, 8);
    lines.forEach((ln, i) => ctx.fillText(ln, 40, 120 + i * 42));
  });
  mat.emissiveColor = new Color3(0.14, 0.14, 0.14);
  mat.emissiveTexture = mat.albedoTexture;
  panel.material = mat;
  panel.parent = root;

  o.pickables.push(back, panel);
}
