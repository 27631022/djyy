import {
  type AbstractMesh,
  type AnimationGroup,
  Color3,
  type Camera,
  GlowLayer,
  Material,
  Mesh,
  MeshBuilder,
  type MorphTarget,
  Ray,
  SceneLoader,
  type Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { Fixture, HallGuide } from '../types';
import type { ThemeParams } from '../theme/presets';
import { clampMaterialLights, emissiveMat, pbr } from '../scene/materialFactory';
import { canvasTexture } from '../fixtures/placeholder';

/**
 * 在线解说员「党建小益」(数字人):走到展品前点击 → 小益出现在展品前、转向观众、
 * 播该展品的 AI 解说音频、底部字幕,并按音频振幅驱动口型(glb 含 mouth/jaw morph 时对口型,
 * 否则用同步呼吸/张合动效)。无 glb 时用内置程序化占位形象,整条交互照样跑通。
 *
 * 设计:形象常驻场景但默认隐藏;narrate() 时定位到展品与观众之间、面向相机、显形。
 * close()/点别处/ESC 隐藏。形象网格全部不可拾取,不干扰展品点选。
 */
export interface GuideNarrator {
  narrate(fx: Fixture): void;
  close(): void;
  isActive(): boolean;
  /** 当前正在讲解的展品 id(未讲解返回 null);供「再次点击同一展品 → 查看大图」判断 */
  narratingId(): string | null;
  /** 释放:移除全局监听 + 关音频上下文 + 移除字幕 DOM + 销毁形象(当前整页换厅用不到,留给将来 SPA 重建场景) */
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MOUTH_RE = /mouth|jaw|aa|open|viseme/i;
const GUIDE_HEIGHT = 1.65; // 形象目标身高(米)

export function createGuideNarrator(
  scene: Scene,
  camera: Camera,
  guide: HallGuide,
  theme: ThemeParams,
  opts: {
    onDetail: (fx: Fixture) => void;
    spawn: { x: number; y: number };
    walls?: Mesh[];
    /** 「关闭」按钮 / ESC:彻底关闭(详情浮层 + 讲解一起关)。缺省只关讲解 */
    onRequestCloseAll?: () => void;
  },
): GuideNarrator {
  const name = guide.name?.trim() || '党建小益';
  const wallSet = new Set<Mesh>(opts.walls ?? []); // 站位避让用:右侧被墙挡则改左侧
  let currentId: string | null = null; // 当前讲解的展品 id
  const root = new TransformNode('guide-root', scene);
  // 迎宾位:从出生点朝房间中心方向固定前移 1.5~2.5m(必离开玩家、朝向开阔处),
  // 进厅即见解说员站在前方。⚠ 出生点恰在房间中心(spawn=0,0,常见缺省)时 toCenter 长度为 0,
  // 用 +Z 兜底方向,绝不让迎宾位落在相机正下方(原 min(2,cl*0.5) 在中心时为 0 → 贴脸 bug)。
  const home = new Vector3(opts.spawn.x, 0, opts.spawn.y);
  const toCenter = new Vector3(-opts.spawn.x, 0, -opts.spawn.y);
  const cl = toCenter.length();
  const dir = cl > 0.5 ? toCenter.scale(1 / cl) : new Vector3(0, 0, 1);
  home.addInPlace(dir.scale(clamp(cl, 1.5, 2.5)));
  root.position.copyFrom(home);
  root.setEnabled(false); // modelReady 后再淡入现身(占位形象同步、glb 异步)
  // 口型驱动目标(glb morph)/ 占位嘴部网格 / 头部(回退呼吸动效)
  const mouthTargets: MorphTarget[] = [];
  let mouthMesh: Mesh | null = null;
  let headNode: TransformNode | null = null;
  const animGroups: AnimationGroup[] = []; // 模型自带动画(身体动作 + 表情)— 循环播待机
  let idleAnim: AnimationGroup | null = null;
  // 2.5D 立绘看板(kind==='sprite'):父级朝相机;身体层切 闭嘴/说话/眨眼 帧做口型;
  // 手臂层以肩为轴,代码驱动「挥手打招呼 / 伸手介绍 / 待机轻摆」三种手势
  let spriteRig: TransformNode | null = null; // 立绘父级(呼吸/弹动叠加在此,身体+手臂一起缩放)
  let spriteMat: StandardMaterial | null = null; // 身体材质(口型帧切换)
  let texClosed: Texture | null = null;
  let texTalk: Texture | null = null;
  let texBlink: Texture | null = null;
  let armPivot: TransformNode | null = null; // 手臂支点(肩);rotation.z 摆动 = 挥手/伸手
  let texArm: Texture | null = null;
  let gesture: 'idle' | 'wave' | 'present' = 'idle'; // 当前手势
  let gestureT0 = 0; // 手势起始时刻(秒)
  let modelReady = false;
  let mouthAmp = 0; // 当前张口度 0..1(平滑后)
  // 出现/离开用「渐显·渐隐」而非横穿房间(避免穿墙/突然飞出)
  const guideMeshes: AbstractMesh[] = []; // 形象所有网格,统一调 visibility 做淡入淡出
  let visT = 0; // 当前可见度 0..1
  let fadeTarget = 0; // 目标可见度(1 现身 / 0 隐去)
  let pendingPos: Vector3 | null = null; // 淡出到 0 后瞬移到此处再淡入(close 回迎宾位用)
  let travelDest: Vector3 | null = null; // 边滑边显现的目标(narrate:从远处划到展品旁)
  let travelStartDist = 0; // 滑行起点到目标的距离(用于把可见度绑定到行程进度)
  let lastFadeT = performance.now() / 1000; // 自算 dt 的时间戳(不依赖引擎 deltaTime)
  const armSign = guide.armFlip ? -1 : 1; // 手臂旋转方向(图里手臂在另一侧时反向)
  const setGesture = (g: 'idle' | 'wave' | 'present'): void => {
    gesture = g;
    gestureT0 = performance.now() / 1000;
  };

  /* ── 形象:2.5D 立绘 / glb / 程序化占位 ── */
  if (guide.kind === 'sprite' && guide.spriteUrl) {
    buildSprite();
  } else if (guide.modelUrl) {
    const ext = guide.modelName?.toLowerCase().endsWith('.gltf') ? '.gltf' : '.glb';
    SceneLoader.LoadAssetContainerAsync(`${guide.modelUrl}/rel/`, '__self__', scene, undefined, ext)
      .then((container) => {
        container.addAllToScene();
        for (const l of container.lights) l.dispose();
        for (const cam of container.cameras) cam.dispose();
        clampMaterialLights(scene); // 同模型台:防 glb 抬高材质灯数撑爆弱驱动 UBO
        for (const m of container.meshes) {
          const matName = m.material?.name ?? '';
          if (/shadow/i.test(m.name) || /shadow/i.test(matName)) m.setEnabled(false);
          m.isPickable = false; // 形象不参与展品拾取
        }
        // 收集口型 morph(数字人 glb 常带 ARKit/viseme blendshape)
        for (const m of container.meshes) {
          const mgr = m.morphTargetManager;
          if (!mgr) continue;
          for (let i = 0; i < mgr.numTargets; i++) {
            const t = mgr.getTarget(i);
            if (MOUTH_RE.test(t.name ?? '')) mouthTargets.push(t);
          }
        }
        // 播放模型自带动画:Maya/glTF 的身体骨骼动作 + 表情动画都存在 animationGroups 里。
        // 循环播「待机」(名字含 idle/待机/stand 优先,否则第 1 个);讲解时的对口型仍由
        // 音频振幅在渲染循环里覆盖嘴部 morph,动画负责身体 + 其余表情。
        if (container.animationGroups.length) {
          animGroups.push(...container.animationGroups);
          for (const g of animGroups) g.stop();
          const idle =
            animGroups.find((g) => /idle|待机|stand|breath|呼吸/i.test(g.name)) ?? animGroups[0];
          if (idle) {
            idle.start(true);
            idleAnim = idle;
          }
        }
        const modelRoot = container.createRootMesh();
        // 量包围盒(尚未挂 root,世界系=模型系),按目标身高等比缩放、脚底落 y=0、水平居中
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const m of container.meshes) {
          if (m.getTotalVertices() === 0 || !m.isEnabled()) continue;
          m.computeWorldMatrix(true);
          const bb = m.getBoundingInfo().boundingBox;
          min.minimizeInPlace(bb.minimumWorld);
          max.maximizeInPlace(bb.maximumWorld);
        }
        const sy = max.y - min.y || 1;
        const s = (GUIDE_HEIGHT / sy) * (guide.scale ?? 1);
        modelRoot.parent = root;
        modelRoot.scaling.setAll(s);
        modelRoot.position.set(
          -((min.x + max.x) / 2) * s,
          -min.y * s,
          -((min.z + max.z) / 2) * s,
        );
        modelReady = true;
        guideMeshes.push(...root.getChildMeshes(false));
        for (const m of guideMeshes) m.visibility = 0;
        fadeTarget = 1; // 淡入现身(迎宾位)
        root.setEnabled(true);
      })
      .catch((e) => {
        console.warn('[展厅] 解说员形象加载失败,改用占位形象:', e);
        buildPlaceholder();
      });
  } else {
    buildPlaceholder();
  }

  /** 内置程序化占位形象:身体 + 头 + 眼 + 嘴(随振幅张合)+ 脚下光环 + 名牌 */
  function buildPlaceholder(): void {
    const sc = guide.scale ?? 1;
    const accent = theme.accent;
    const body = MeshBuilder.CreateCylinder('guide-body', { diameterTop: 0.34, diameterBottom: 0.46, height: 0.92, tessellation: 24 }, scene);
    body.position.set(0, 0.46 * sc, 0);
    body.material = pbr(scene, 'guide-body-mat', { color: accent, roughness: 0.5, metallic: 0.1 });
    body.isPickable = false;
    body.parent = root;

    const head = new TransformNode('guide-head', scene);
    head.parent = root;
    head.position.set(0, 1.18 * sc, 0);
    headNode = head;
    const skull = MeshBuilder.CreateSphere('guide-skull', { diameter: 0.46, segments: 20 }, scene);
    skull.material = pbr(scene, 'guide-skull-mat', { color: Color3.FromHexString('#F3D9C0'), roughness: 0.7 });
    skull.isPickable = false;
    skull.parent = head;
    // 红色小帽顶(党建感)
    const cap = MeshBuilder.CreateSphere('guide-cap', { diameter: 0.5, segments: 16, slice: 0.5 }, scene);
    cap.position.y = 0.12;
    cap.material = emissiveMat(scene, 'guide-cap-mat', accent.scale(0.7));
    cap.isPickable = false;
    cap.parent = head;
    for (const sgn of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere(`guide-eye-${sgn}`, { diameter: 0.06, segments: 8 }, scene);
      eye.position.set(sgn * 0.1, 0.02, 0.21); // +Z 为正面(与朝向公式 atan2(dx,dz) 一致)
      eye.material = pbr(scene, `guide-eye-mat-${sgn}`, { color: Color3.FromHexString('#2A2A2A'), roughness: 0.3 });
      eye.isPickable = false;
      eye.parent = head;
    }
    const mouth = MeshBuilder.CreateBox('guide-mouth', { width: 0.14, height: 0.04, depth: 0.02 }, scene);
    mouth.position.set(0, -0.1, 0.21);
    mouth.material = pbr(scene, 'guide-mouth-mat', { color: Color3.FromHexString('#7A2A2A'), roughness: 0.5 });
    mouth.isPickable = false;
    mouth.parent = head;
    mouthMesh = mouth;
    // 脚下发光环
    const ring = MeshBuilder.CreateTorus('guide-ring', { diameter: 0.6, thickness: 0.03, tessellation: 32 }, scene);
    ring.position.y = 0.02;
    ring.material = emissiveMat(scene, 'guide-ring-mat', accent.scale(0.9));
    ring.isPickable = false;
    ring.parent = root;
    // 名牌(头顶 canvas 文字,面向相机)
    const tag = MeshBuilder.CreatePlane('guide-tag', { width: 0.9, height: 0.26 }, scene);
    tag.position.set(0, 1.7 * sc, 0);
    tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
    tag.isPickable = false;
    const tagMat = pbr(scene, 'guide-tag-mat', { color: Color3.White(), roughness: 0.9 });
    tagMat.albedoTexture = canvasTexture(scene, 'guide-tag-tex', 360, 104, (ctx, tw, th) => {
      ctx.fillStyle = theme.accent.toHexString();
      ctx.fillRect(0, 0, tw, th);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(th * 0.5)}px 'Microsoft YaHei', sans-serif`;
      ctx.fillText(name, tw / 2, th / 2 + 2);
    });
    tagMat.emissiveColor = new Color3(0.3, 0.3, 0.3);
    tagMat.emissiveTexture = tagMat.albedoTexture;
    tag.material = tagMat;
    tag.parent = root;
    modelReady = true;
    guideMeshes.push(...root.getChildMeshes(false));
    for (const m of guideMeshes) m.visibility = 0;
    fadeTarget = 1; // 淡入现身(迎宾位)
    root.setEnabled(true);
  }

  /** 2.5D 立绘看板(拆层手臂):父级 rig 朝相机;身体层切口型/眨眼帧;手臂层以肩为轴转做手势。
   *  脚底落 root(y=0)。⚠ 身体图须为「去掉会动那条手臂」的版本,手臂图为单独一张、同画布对齐的透明 PNG。 */
  function buildSprite(): void {
    const H = 2.0 * (guide.scale ?? 1); // 立绘目标身高(米;2m 略大于真人更有存在感,再用「大小」微调)
    const rig = new TransformNode('guide-sprite-rig', scene);
    rig.parent = root;
    rig.billboardMode = Mesh.BILLBOARDMODE_Y; // 整组立绘朝相机(水平),手臂在其本地平面内转
    rig.setEnabled(false); // 贴图就绪后再显形
    spriteRig = rig;
    // ⚠ 立绘是「全自发光」显示(不受展厅灯光),否则会被 GlowLayer 辉光层当成发光体整片发光
    //   (展品光锥也是这样排除的)→ 身体/手臂网格都要 addExcludedMesh 排除出辉光层。
    const excludeFromGlow = (m: Mesh): void => {
      for (const layer of scene.effectLayers) {
        if (layer instanceof GlowLayer) layer.addExcludedMesh(m);
      }
    };
    const SPRITE_BRIGHTNESS = clamp(guide.brightness ?? 1.0, 0.3, 1.6); // 立绘亮度(1=原图;走 emissiveTexture.level 乘性缩放)
    const mkUnlit = (n: string): StandardMaterial => {
      const m = new StandardMaterial(n, scene);
      m.disableLighting = true; // 不受展厅灯光影响,自发光显示原图(×亮度)
      // 漫反射色清零:disableLighting 下漫反射仍满亮显示贴图,会盖过 emissive → 清零让 emissive 成唯一来源。
      m.diffuseColor = new Color3(0, 0, 0);
      // ⚠ 有 emissiveTexture 时 emissiveColor 是「加性」(emissiveColor + 贴图×level),控不了亮度;
      //   亮度必须走 emissiveTexture.level(乘性,贴图就绪时设)→ 故 emissiveColor 清零。
      m.emissiveColor = new Color3(0, 0, 0);
      m.backFaceCulling = false;
      m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      m.useAlphaFromDiffuseTexture = true;
      return m;
    };
    const body = MeshBuilder.CreatePlane('guide-sprite-body', { size: 1 }, scene);
    body.isPickable = false;
    body.parent = rig;
    body.position.y = H / 2; // 面片中心抬到半身高,脚底落 rig 原点
    const mat = mkUnlit('guide-sprite-mat');
    body.material = mat;
    spriteMat = mat;
    excludeFromGlow(body);
    const loadTex = (
      url: string | undefined,
      onReady?: (t: Texture) => void,
      onErr?: () => void,
    ): Texture | null => {
      if (!url) return null;
      const t = new Texture(url, scene, undefined, undefined, undefined, () => onReady?.(t), onErr ? () => onErr() : null);
      t.hasAlpha = true;
      return t;
    };
    // 身体默认/闭嘴帧:就绪后按宽高比定尺寸 + 建手臂层 + 淡入现身 + 打招呼挥手;失败回退占位形象
    texClosed = loadTex(
      guide.spriteUrl,
      (t) => {
        const sz = t.getSize();
        const aspect = sz.height > 0 ? sz.width / sz.height : 0.5;
        const W = H * aspect;
        body.scaling.x = W;
        body.scaling.y = H;
        mat.diffuseTexture = t;
        mat.emissiveTexture = t;
        t.level = SPRITE_BRIGHTNESS; // ★亮度:贴图 level 乘性缩放(emissiveColor 是加性、控不了亮度)
        // 手臂层(可选):同画布对齐,以肩(归一化 armPivotX/Y)为轴;旋转 0 时与身体严丝合缝
        if (guide.spriteArmUrl) {
          const px = guide.armPivotX ?? 0.62; // 肩点 X(0..1,从左)
          const py = guide.armPivotY ?? 0.42; // 肩点 Y(0..1,从上)
          const shoulderX = (px - 0.5) * W;
          const shoulderY = (1 - py) * H; // 图顶=H、图底=0
          const pivot = new TransformNode('guide-sprite-arm-pivot', scene);
          pivot.parent = rig;
          pivot.position.set(shoulderX, shoulderY, 0);
          armPivot = pivot;
          const arm = MeshBuilder.CreatePlane('guide-sprite-arm', { size: 1 }, scene);
          arm.isPickable = false;
          arm.parent = pivot;
          arm.scaling.x = W;
          arm.scaling.y = H;
          arm.position.set(-shoulderX, H / 2 - shoulderY, 0); // 旋转 0 时手臂图与身体对齐
          arm.renderingGroupId = guide.rimLight ? 2 : 1; // 手臂盖在身体之上(开轮廓光时 body=1 → 手臂=2)
          const armMat = mkUnlit('guide-sprite-arm-mat');
          arm.material = armMat;
          excludeFromGlow(arm);
          texArm = loadTex(guide.spriteArmUrl, (at) => {
            armMat.diffuseTexture = at;
            armMat.emissiveTexture = at;
            at.level = SPRITE_BRIGHTNESS;
          });
        }
        // 轮廓光(可选):身体剪影放大一圈、纯亮色,叠在身体背后 → 勾出一圈描边,把人从背景分离、更清晰
        if (guide.rimLight) {
          body.renderingGroupId = 1; // 身体抬到轮廓之上(轮廓 renderingGroupId=0 先画=背后)
          const rim = MeshBuilder.CreatePlane('guide-sprite-rim', { size: 1 }, scene);
          rim.isPickable = false;
          rim.parent = rig;
          rim.position.y = H / 2;
          rim.scaling.x = W * 1.05;
          rim.scaling.y = H * 1.05;
          rim.renderingGroupId = 0;
          const rimMat = mkUnlit('guide-sprite-rim-mat'); // diffuseColor=0 + useAlphaFromDiffuseTexture
          rimMat.diffuseTexture = t; // 取 alpha 当剪影形状(不挂 emissiveTexture → 纯色)
          rimMat.emissiveColor = new Color3(1.15, 1.18, 1.3); // 轮廓光色(冷白偏亮)
          rim.material = rimMat;
          excludeFromGlow(rim);
        }
        modelReady = true;
        guideMeshes.push(...rig.getChildMeshes(false));
        for (const m of guideMeshes) m.visibility = 0;
        fadeTarget = 1; // 淡入现身(迎宾位)
        rig.setEnabled(true);
        root.setEnabled(true);
        setGesture('wave'); // 出场打招呼挥手
      },
      () => {
        console.warn('[展厅] 解说员立绘加载失败,改用占位形象');
        buildPlaceholder();
      },
    );
    // ⚠ 说话/眨眼帧也要设同样的 level,否则切帧时亮度跳回原图(默认帧亮、其余帧暗的闪烁)
    texTalk = loadTex(guide.spriteTalkUrl);
    if (texTalk) texTalk.level = SPRITE_BRIGHTNESS;
    texBlink = loadTex(guide.spriteBlinkUrl);
    if (texBlink) texBlink.level = SPRITE_BRIGHTNESS;
  }

  /* ── 字幕条(DOM,永远清晰)── */
  const bar = document.createElement('div');
  bar.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:55;
    display:none;max-width:min(760px,94vw);background:rgba(16,16,20,.82);backdrop-filter:blur(8px);
    color:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 14px 48px rgba(0,0,0,.5);
    border:1px solid ${theme.accent.toHexString()}66;`;
  const nameEl = document.createElement('div');
  nameEl.style.cssText = `font:bold 14px 'Microsoft YaHei',sans-serif;color:${theme.accent.toHexString()};
    display:flex;align-items:center;gap:6px;margin-bottom:6px;`;
  nameEl.textContent = `🎤 ${name}`;
  const textEl = document.createElement('div');
  textEl.style.cssText = `font:15px/1.7 'Microsoft YaHei',sans-serif;color:#f3f3f3;white-space:pre-wrap;`;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:10px;';
  const detailBtn = document.createElement('button');
  detailBtn.style.cssText = `border:none;background:${theme.accent.toHexString()};color:#fff;
    border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;`;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = `border:1px solid #ffffff44;background:transparent;color:#ddd;
    border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;margin-left:auto;`;
  actions.append(detailBtn, closeBtn);
  bar.append(nameEl, textEl, actions);
  document.body.appendChild(bar);

  /* ── 音频 + 振幅分析(口型驱动)── */
  let audioCtx: AudioContext | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let analyser: AnalyserNode | null = null;
  let srcNode: MediaElementAudioSourceNode | null = null;
  let ampBuf: Uint8Array<ArrayBuffer> | null = null;
  let active = false;

  // 解锁音频:浏览器要求「真实用户手势」(鼠标/键盘/触摸)后才允许播放音频 / resume AudioContext。
  // ⚠ 手柄按键不算用户手势 —— 纯手柄触发的解说会被浏览器静音。这里在首个真实手势(进厅时点画面/
  // 点「沉浸漫游」/任意按键)就创建并 resume AudioContext,之后手柄 A 触发的解说即可出声。
  const unlockAudio = () => {
    try {
      audioCtx ??= new AudioContext();
      if (audioCtx.state === 'suspended') void audioCtx.resume();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);

  const stopAudio = () => {
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
    }
    try {
      srcNode?.disconnect();
      analyser?.disconnect();
    } catch {
      /* ignore */
    }
    srcNode = null;
    analyser = null;
    audioEl = null;
    ampBuf = null;
  };

  const playAudio = async (url: string) => {
    stopAudio();
    try {
      audioCtx ??= new AudioContext();
      // 先 resume 到 running(否则把媒体源接到挂起的 context,音频不加载/不出声)
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const el = new Audio(url);
      el.preload = 'auto';
      audioEl = el;
      // 同源(prod 同 3001 / dev 经 vite proxy),createMediaElementSource 可分析振幅
      srcNode = audioCtx.createMediaElementSource(el);
      const an = audioCtx.createAnalyser();
      an.fftSize = 256;
      srcNode.connect(an);
      an.connect(audioCtx.destination);
      analyser = an;
      ampBuf = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
      await el.play().catch(() => undefined);
    } catch (e) {
      console.warn('[展厅] 解说音频播放失败:', e);
    }
  };

  /* ── 每帧:渐显·渐隐(出现/离开) / 面向相机 / 呼吸 / 口型 ── */
  scene.onBeforeRenderObservable.add(() => {
    if (!root.isEnabled() || !modelReady) return;
    const nowS = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, nowS - lastFadeT)); // wall-clock dt(封顶 0.1s 防卡顿跳变)
    lastFadeT = nowS;
    if (travelDest) {
      // 从远处匀速划过来:可见度 = 行程进度(起点远 → 0,到位 → 1)—— 越近越清晰
      const dxT = travelDest.x - root.position.x;
      const dzT = travelDest.z - root.position.z;
      const dist = Math.hypot(dxT, dzT);
      const stepLen = 4 * dt; // 4 米/秒 滑行
      if (dist <= stepLen || dist < 0.05) {
        root.position.x = travelDest.x;
        root.position.z = travelDest.z;
        travelDest = null;
        visT = 1;
        fadeTarget = 1;
      } else {
        root.position.x += (dxT / dist) * stepLen;
        root.position.z += (dzT / dist) * stepLen;
        visT = travelStartDist > 0.05 ? Math.min(1, 1 - dist / travelStartDist) : 1;
      }
    } else {
      // 非滑行:按时间淡入/淡出(迎宾位淡入、取消时原地淡出)
      const fadeSpeed = 1 / 0.4; // ~0.4s
      if (fadeTarget > visT) visT = Math.min(1, visT + dt * fadeSpeed);
      else if (fadeTarget < visT) visT = Math.max(0, visT - dt * fadeSpeed);
      if (pendingPos && visT <= 0.02) {
        root.position.x = pendingPos.x;
        root.position.z = pendingPos.z;
        pendingPos = null;
        fadeTarget = 1;
      }
    }
    for (const m of guideMeshes) m.visibility = visT;
    root.scaling.setAll(0.9 + 0.1 * visT); // 由略小渐渐放大,像由远及近 materialize
    // 面向相机(形象正面 = +Z;atan2(dx,dz) 使 +Z 指向相机)
    const dx = camera.position.x - root.position.x;
    const dz = camera.position.z - root.position.z;
    if (dx * dx + dz * dz > 0.04) root.rotation.y = Math.atan2(dx, dz);
    // 振幅 → 目标张口度
    let target = 0;
    if (active && analyser && ampBuf) {
      analyser.getByteTimeDomainData(ampBuf);
      let sum = 0;
      for (let i = 0; i < ampBuf.length; i++) {
        const v = (ampBuf[i] - 128) / 128;
        sum += v * v;
      }
      target = clamp(Math.sqrt(sum / ampBuf.length) * 4.5, 0, 1);
    }
    mouthAmp += (target - mouthAmp) * 0.4; // 平滑跟随
    if (mouthTargets.length) {
      // 讲解中:音频振幅驱动嘴部 morph(覆盖动画里的嘴,对 TTS 口型);
      // 非讲解:有自带动画就交给动画驱动嘴部,否则闭合
      if (active) for (const t of mouthTargets) t.influence = mouthAmp;
      else if (!idleAnim) for (const t of mouthTargets) t.influence = 0;
    } else if (mouthMesh) {
      mouthMesh.scaling.y = 1 + mouthAmp * 5; // 嘴随张口拉高
      mouthMesh.scaling.x = 1 - mouthAmp * 0.25;
    } else if (headNode) {
      headNode.position.y = 1.18 * (guide.scale ?? 1) + mouthAmp * 0.02;
    } else if (spriteMat) {
      // 2.5D 立绘:讲解中张口度过阈值 → 切「说话」帧;否则「闭嘴」帧;有眨眼帧则周期眨眼
      const tb = performance.now() / 1000;
      const talking = active && mouthAmp > 0.16 && !!texTalk;
      const blinking = !talking && !!texBlink && tb % 4 < 0.12;
      const tex = blinking ? texBlink : talking ? texTalk : texClosed;
      if (tex && spriteMat.emissiveTexture !== tex) {
        spriteMat.emissiveTexture = tex;
        spriteMat.diffuseTexture = tex;
      }
      // 真人立绘不做 Q 弹挤压/弹动(会显得拉伸变形)。说话只靠口型帧切换 + 手臂手势,
      // 身体保持稳定;极轻微的整体起伏交给 root 的呼吸(见渲染循环末尾)。
      if (spriteRig) {
        spriteRig.position.y = 0;
        spriteRig.scaling.set(1, 1, 1);
      }
      // 手臂手势:wave=举臂来回摆(打招呼)/ present=向外伸出并保持(介绍)/ idle=轻微摆动
      if (armPivot) {
        const ga = tb - gestureT0;
        let armZ: number;
        if (gesture === 'wave') {
          const raise = Math.min(1, ga / 0.3); // 0.3s 抬起
          armZ = armSign * (1.15 * raise + Math.sin(ga * 9) * 0.28); // 举高 + 来回摆
          if (ga > 2.2) setGesture(active ? 'present' : 'idle'); // 挥完转介绍/待机
        } else if (gesture === 'present') {
          const ext = Math.min(1, ga / 0.4); // 0.4s 伸出
          armZ = armSign * 0.72 * ext + Math.sin(tb * 1.5) * 0.03; // 伸出 + 轻微浮动
          if (!active) setGesture('idle'); // 说完收回
        } else {
          armZ = Math.sin(tb * 1.2) * 0.05; // 待机轻摆
        }
        armPivot.rotation.z += (armZ - armPivot.rotation.z) * 0.2; // 平滑跟随
      }
    }
    // 轻微待机呼吸(无音频时也有生气);基线 ≥0,避免脚底/光环周期性沉到地面以下。
    // ⚠ 2.5D 立绘是平面、脚要踩地,整体位移会变成"全身飘浮" → 立绘钉在地上不做位移呼吸。
    const t = performance.now() / 1000;
    root.position.y = spriteRig ? 0 : 0.008 + Math.sin(t * 1.6) * 0.008;
  });

  /* ── 对外:讲解 / 关闭 ── */
  const narrate = (fx: Fixture): void => {
    const n = fx.narration ?? {};
    const text = (n.text ?? '').trim();
    // 目标位:站到展品「一侧」介绍(默认观众视角右侧),贴近展品旁、略朝观众,
    // 不挡在观众与展品之间。front=展品→观众(正面);right = cross(up,front) 反向 = 观众面对展品时的右手方向。
    const fxPos = new Vector3(fx.x, 0, fx.y);
    const toCam = camera.position.subtract(fxPos);
    toCam.y = 0;
    const dist = toCam.length() || 1;
    const front = toCam.scale(1 / dist);
    const right = new Vector3(-front.z, 0, front.x);
    const sideOff = clamp(fx.w / 2 + 0.7, 0.9, 2.2); // 站到展品边缘外约 0.7m
    const fwdOff = 0.8; // 略朝观众,避免嵌进展品/墙
    // 沿优先侧水平射线探墙(展品在墙角等)→ 该侧空间不够,自动改站另一侧
    const sideClear = (dir: Vector3): boolean => {
      if (!wallSet.size) return true;
      const origin = fxPos.add(front.scale(fwdOff));
      origin.y = 1.0;
      const hit = scene.pickWithRay(new Ray(origin, dir, sideOff + 0.4), (m) => wallSet.has(m as Mesh));
      return !hit?.hit;
    };
    const left = right.scale(-1);
    // 站位优先侧:默认观众左手侧解说,另一侧仅在优先侧被墙挡时兜底(解说员设置可切左/右)
    const preferLeft = guide.narrateSide !== 'right';
    const primary = preferLeft ? left : right;
    const secondary = preferLeft ? right : left;
    const sideVec = !sideClear(primary) && sideClear(secondary) ? secondary : primary;
    // 从远处划过来逐渐显示:起点设在展品正面远处(朝观众/开阔侧,避开墙),匀速划到展品旁;
    // 可见度随行程从 0 渐增到 1(见渲染循环 travelDest 分支)—— 越近越清晰,到位才完全显现。
    const dest = fxPos.add(sideVec.scale(sideOff)).add(front.scale(fwdOff));
    const far = clamp(dist * 0.8, 2.5, 4.5); // 起点离展品旁多远(沿正面朝观众,开阔无墙)
    root.position.set(dest.x + front.x * far, 0, dest.z + front.z * far);
    travelDest = new Vector3(dest.x, 0, dest.z);
    travelStartDist = far;
    pendingPos = null;
    visT = 0;
    fadeTarget = 1;

    // 字幕 + 「查看详情」(打开原详情浮层:图片大图轮播 / 视频全屏 / 荣誉·党务列表等)
    textEl.textContent = text || `这里是「${fx.label ?? '展品'}」,欢迎参观。`;
    detailBtn.textContent =
      fx.type === 'video_wall' ? '▶ 播放视频' : fx.type === 'image_case' ? '🖼 查看大图' : '查看详情';
    detailBtn.onclick = () => opts.onDetail(fx);
    bar.style.display = 'block';

    // 音频
    active = true;
    currentId = fx.id;
    if (n.audioUrl) void playAudio(n.audioUrl);
    else stopAudio();
    // 手势:解说词含问候语 → 先挥手再介绍;否则直接伸手介绍(无手臂层时无副作用)
    setGesture(/你好|您好|大家好|欢迎|hello|hi[\s,，。!!]/i.test(text) ? 'wave' : 'present');
  };

  // 关闭讲解:停音频 + 收字幕,解说员渐隐 → 瞬移回迎宾位 → 渐显(常驻可见,不横穿房间)
  const close = (): void => {
    active = false;
    currentId = null;
    stopAudio();
    mouthAmp = 0;
    if (mouthTargets.length) for (const t of mouthTargets) t.influence = 0;
    bar.style.display = 'none';
    setGesture('idle'); // 收回手势
    // 取消:原地淡出消失即可(不滑回、不瞬移回迎宾位);下次讲解再从远处渐显出来
    travelDest = null;
    pendingPos = null;
    fadeTarget = 0;
  };
  // 「关闭」按钮 = 彻底关闭(详情浮层 + 讲解);无回调时只关讲解
  const closeAll = () => (opts.onRequestCloseAll ? opts.onRequestCloseAll() : close());
  closeBtn.onclick = closeAll;
  // ESC 彻底关闭。具名 handler 便于 dispose 时移除。
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && active) closeAll();
  };
  document.addEventListener('keydown', onKey);

  const dispose = (): void => {
    close();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    void audioCtx?.close().catch(() => undefined);
    audioCtx = null;
    bar.remove();
    for (const g of animGroups) g.dispose();
    spriteMat?.dispose();
    for (const t of [texClosed, texTalk, texBlink, texArm]) t?.dispose();
    root.dispose();
  };

  return { narrate, close, isActive: () => active, narratingId: () => (active ? currentId : null), dispose };
}
