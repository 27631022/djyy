import {
  Color3,
  Mesh,
  MeshBuilder,
  SceneLoader,
  TransformNode,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import type { Fixture, ModelStandContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { clampMaterialLights, emissiveMat, glassMat, pbr } from '../scene/materialFactory';
import { fixtureRoot, markPickable } from './fixtureUtils';
import { canvasTexture, wrapCjk } from './placeholder';
import type { BuiltFixture } from './imageCaseBuilder';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 重模型阈值:导入模型顶点超此数(如高模卡车 300 万)时,加载后撤玻璃罩 + 钳贴图各向异性,
 *  缓解集显近距离 fill(透明罩 overdraw + 逐像素各向异性是 UHD630 走近卡顿的 GPU 大头)。 */
const HEAVY_VERTEX_THRESHOLD = 500_000;

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
  const standH = clamp(c.standH ?? 1.0, 0, 1.6); // 台面(顶面)离地高度
  const hasBody = standH >= 0.12; // 低于 12cm 不出台身,展品直接落地(汽车等大件)
  const wantDome = c.dome !== false; // 玻璃罩可选,默认有
  const topY = hasBody ? standH : 0; // 展品底面所在高度
  const maxModelH = clamp(Math.min(plateW, plateD) + 0.2, 0.6, 2.2);

  /* ── 台身(standH≈0 时整段跳过) ── */
  const mkBody = (name: string, bw: number, bd: number, h: number): Mesh =>
    shape === 'round'
      ? MeshBuilder.CreateCylinder(name, { diameter: Math.min(bw, bd), height: h, tessellation: 48 }, scene)
      : MeshBuilder.CreateBox(name, { width: bw, depth: bd, height: h }, scene);

  // 精致细节:发光圈/灯线(圆台用环;方台用 4 根细边框条 —— 实心发光板在落地模式像块红毯)
  const mkGlow = (name: string, gw: number, gd: number, y: number, thick: number) => {
    const mat = emissiveMat(scene, `${name}-mat`, theme.accent.scale(0.85));
    const place = (m: Mesh, px: number, pz: number) => {
      m.position.set(px, y, pz);
      m.material = mat;
      m.isPickable = false;
      m.parent = root;
    };
    if (shape === 'round') {
      place(
        MeshBuilder.CreateTorus(name, { diameter: Math.min(gw, gd), thickness: thick, tessellation: 48 }, scene),
        0,
        0,
      );
      return;
    }
    const t = Math.max(thick, 0.03); // 边框条宽
    const h = thick * 0.7;
    place(MeshBuilder.CreateBox(`${name}:n`, { width: gw, depth: t, height: h }, scene), 0, -gd / 2);
    place(MeshBuilder.CreateBox(`${name}:s`, { width: gw, depth: t, height: h }, scene), 0, gd / 2);
    place(MeshBuilder.CreateBox(`${name}:w`, { width: t, depth: gd, height: h }, scene), -gw / 2, 0);
    place(MeshBuilder.CreateBox(`${name}:e`, { width: t, depth: gd, height: h }, scene), gw / 2, 0);
  };

  const colW = plateW - 0.12;
  const colD = plateD - 0.12;
  const pickables: Mesh[] = [];

  if (hasBody) {
    const colH = standH - 0.05; // 柱身,上面还有 0.05 台板
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

    mkGlow(`stand-ring:${fx.id}:top`, colW + 0.04, colD + 0.04, standH - 0.06, 0.018);
    pickables.push(pedestal, top);
  }
  // 底部光圈:有台身绕柱脚,落地展品则圈住展位(都好看,保留)
  mkGlow(`stand-ring:${fx.id}:base`, colW + 0.08, colD + 0.08, 0.02, 0.025);

  // 玻璃罩(罩住展品区;微透反光;可选)。ref 外提:重模型加载后按面数判定撤掉
  // (透明罩占满屏的 overdraw 是集显近距离 fill 大户;落地大件本就不该套展柜罩)。
  let domeMesh: Mesh | null = null;
  if (wantDome) {
    const domeH = maxModelH + 0.12;
    const dome =
      shape === 'round'
        ? MeshBuilder.CreateCylinder(`stand-dome:${fx.id}`, { diameter: Math.min(plateW, plateD) + 0.12, height: domeH, tessellation: 48 }, scene)
        : MeshBuilder.CreateBox(`stand-dome:${fx.id}`, { width: plateW + 0.12, depth: plateD + 0.12, height: domeH }, scene);
    dome.position.set(0, topY + domeH / 2, 0);
    dome.material = glassMat(scene, `stand-dome-mat:${fx.id}`);
    dome.isPickable = false;
    dome.parent = root;
    domeMesh = dome;
  }

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
    crystal.position.set(0, topY + 0.5, 0);
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
      crystal.position.y = topY + 0.5 + Math.sin(t * 1.2) * 0.05;
    });
  };

  if (c.modelUrl) {
    const ext = c.modelName?.toLowerCase().endsWith('.gltf') ? '.gltf' : '.glb';
    SceneLoader.LoadAssetContainerAsync(`${c.modelUrl}/rel/`, '__self__', scene, undefined, ext)
      .then((container) => {
        container.addAllToScene();
        // ⚠ glb 常内嵌一整套影棚打光 / 相机(工业、设备类模型尤甚):addAllToScene
        // 会把它们一并导入场景,灯数暴涨触发 GL_MAX_VERTEX_UNIFORM_BUFFERS(弱驱动仅
        // 12)→ 顶点着色器编译失败、永远 ready 不了 → 卡在加载读条(实测「职工之家」
        // 卡车 glb 自带 10 盏聚光灯,加环境光 = LIGHTCOUNT 11 撑爆 12 上限)。展厅有
        // 自己的环境光 + 展品射灯,模型自带光/相机一律弃用(它们还是全局光,绕过
        // includedOnlyMeshes 与画质档位管理,有害无益)。
        for (const l of container.lights) l.dispose();
        for (const cam of container.cameras) cam.dispose();
        // ⚠ glTFLoader 在加载完成时会把全场材质的 maxSimultaneousLights 抬到
        // scene.lights.length(展厅 = 环境光 + 每展品 1 射灯,职工之家 11 盏),
        // 顶点 UBO 超 GL_MAX_VERTEX_UNIFORM_BUFFERS(弱驱动 12)→ 着色器编译失败、卡读条。
        // 这段 bump 在本 promise resolve 前已跑完,此处(addAllToScene 后)钳回安全上限。
        clampMaterialLights(scene);
        // 模型自带的地面烘焙阴影片(模型站导出常见,4 顶点大平面 + shadow 材质)
        // 在展台上显示成一块白色长方形 —— 展台有自己的灯光呈现,直接隐藏。
        for (const m of container.meshes) {
          const matName = m.material?.name ?? '';
          if (/shadow/i.test(m.name) || /shadow/i.test(matName)) m.setEnabled(false);
        }
        // 导出器事故兜底(实测用户卡车 glb):分通道贴图套件被乱接进标准 PBR 槽 ——
        // ① baseColorFactor≈#040404(因子×贴图=整模发黑);② metallic=1 + 灰度
        // Roughness 图当 MR 贴图(高金属度吃掉漫反射颜色,室内 IBL 下又黑又灰)。
        // 触发条件 = 有 albedo 贴图却近黑因子(规范模型不会命中):钳回白 + 改弱金属。
        for (const mat of container.materials) {
          const p = mat as unknown as {
            albedoTexture?: unknown;
            albedoColor?: Color3;
            metallic?: number | null;
            roughness?: number | null;
            metallicTexture?: unknown;
          };
          const col = p.albedoColor;
          if (p.albedoTexture && col && Math.max(col.r, col.g, col.b) < 0.25) {
            col.set(1, 1, 1);
            p.metallicTexture = null;
            p.metallic = 0.15;
            p.roughness = 0.7;
          }
        }
        const modelRoot = container.createRootMesh();
        // z-up 模型摆正(横倒):先转再量包围盒,后续贴台面/居中算式不变
        if (c.upAxis === 'z') {
          modelRoot.rotation.x = -Math.PI / 2;
          modelRoot.computeWorldMatrix(true);
        }
        // 量模型自身包围盒(此刻尚未挂 root,世界系=模型系)。
        // 手动累计而不用 getHierarchyBoundingVectors:① 排除已隐藏的阴影片等
        // (它往往比模型本体还大,算进去会把模型挤小、还偏心)② 逐网格
        // computeWorldMatrix(true) 保证 upAxis 旋转后矩阵是新的。
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        const modelMeshes: Mesh[] = [];
        let modelVertices = 0;
        for (const m of container.meshes) {
          if (!(m instanceof Mesh) || !m.isEnabled() || m.getTotalVertices() === 0) continue;
          modelMeshes.push(m);
          modelVertices += m.getTotalVertices();
          m.computeWorldMatrix(true);
          const bb = m.getBoundingInfo().boundingBox;
          min.minimizeInPlace(bb.minimumWorld);
          max.maximizeInPlace(bb.maximumWorld);
        }
        if (!Number.isFinite(min.x)) {
          // 全部网格都被排除的极端兜底:按整树量
          const hv = modelRoot.getHierarchyBoundingVectors(true);
          min.copyFrom(hv.min);
          max.copyFrom(hv.max);
        }
        const sx = max.x - min.x || 1;
        const sy = max.y - min.y || 1;
        const sz = max.z - min.z || 1;
        const s =
          Math.min((plateW + 0.1) / sx, maxModelH / sy, (plateD + 0.1) / sz) *
          (c.scale ?? 1);
        // holder 在台面中心做自转;modelRoot 在内偏移,让模型水平居中、底面落台面
        const holder = new TransformNode(`stand-model:${fx.id}`, scene);
        holder.parent = root;
        holder.position.y = topY;
        modelRoot.parent = holder;
        modelRoot.scaling.setAll(s);
        modelRoot.position.set(
          -((min.x + max.x) / 2) * s,
          -min.y * s,
          -((min.z + max.z) / 2) * s,
        );
        // ⚠ 拾取代理(治「走近模型卡顿」之 CPU 因素):导入模型动辄百万面,若把子网格设为
        // 可拾取,hover/点击/手柄的 scene.pick 会对它做精确 ray-triangle 求交(实测 65ms/次,
        // 比包围盒慢 3000+ 倍)→ 主线程冻结。改为:模型子网格全部不可拾取(仍渲染),用一个
        // 不可见的包围盒代理 box 承接拾取。⚠ 必须 visibility=0 而非 isVisible=false ——
        // 后者会被 scene.pick 默认过滤掉(ray.core.js:不传 predicate 时 !isVisible 即 skip),
        // 代理永远命中不了、模型反而彻底点不中。代理自带 metadata.fixture,三处拾取沿父链第一跳
        // 即得 fixture,点击选中/详情浮层/手柄 A 键语义不变,求交降到 ~0.02ms。
        for (const m of modelMeshes) m.isPickable = false;
        const proxy = MeshBuilder.CreateBox(
          `stand-model-proxy:${fx.id}`,
          { width: sx * s, height: sy * s, depth: sz * s },
          scene,
        );
        proxy.position.set(0, (sy * s) / 2, 0); // 模型底面落 holder 局部 y=0 → 中心在半高
        proxy.parent = holder; // 跟 holder 自转,代理 OBB 恒贴模型
        proxy.visibility = 0; // 视觉不可见,但 isVisible 仍 true → 仍参与拾取
        markPickable([proxy], fx);

        // 重模型(顶点超阈值,卡车 300 万必中)近距离 GPU 缓解:撤玻璃罩(透明罩 overdraw)
        // + 贴图各向异性钳 1(逐像素各向异性近距离斜视很贵)。不改资产、不动小展品。
        if (modelVertices > HEAVY_VERTEX_THRESHOLD) {
          domeMesh?.dispose(false, true);
          for (const t of container.textures) t.anisotropicFilteringLevel = 1;
        }
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
  // 落地模式(无台身)时 pickables 只剩介绍牌;射灯目标为空也无碍(展品靠 IBL)
  return { pickables, spotTargets: [...pickables] };
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
