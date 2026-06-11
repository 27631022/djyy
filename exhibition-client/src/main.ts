import '@babylonjs/loaders/glTF'; // 副作用注册 .glb 加载器(model_stand)
import { hallApi } from './api/hallApi';
import { resolveTheme } from './theme/presets';
import { createEngine } from './scene/engineSetup';
import { createPostFx, createScene } from './scene/sceneSetup';
import { detectInitialLevel, setupQuality } from './scene/qualityManager';
import { buildShell } from './scene/wallBuilder';
import { buildFixtures } from './fixtures/fixtureFactory';
import { createFirstPersonCamera } from './camera/firstPersonCamera';
import { setupMobileControls } from './camera/mobileControls';
import { setupPicking } from './interaction/pickingManager';
import { setupHover } from './interaction/hoverManager';
import { Overlay } from './interaction/overlay';
import { LoadingScreen, showHint } from './ui/loadingScreen';
import { setupImmersiveUi } from './ui/immersive';
import { setupXR } from './xr/webxrHelper';

/**
 * 入口:?hall=<id> 指定展厅;缺省取目录第一个已发布厅。
 * 加载链:厅 JSON → Scene/IBL → 空间外壳 → 相机 → 组件(字体子集) → XR → 渲染。
 */
async function boot(): Promise<void> {
  const loading = new LoadingScreen();
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

  try {
    loading.setProgress(8, '获取展厅数据…');
    let hallId = new URLSearchParams(location.search).get('hall');
    if (!hallId) {
      const all = await hallApi.list();
      hallId = all.find((h) => h.published)?.id ?? null;
      if (!hallId) throw new Error('暂无已发布的展厅,请先在后台布展');
    }
    const hall = await hallApi.get(hallId);
    document.title = hall.name;
    loading.setTitle(hall.name);

    loading.setProgress(25, '初始化渲染引擎…');
    const theme = resolveTheme(hall.meta.theme);
    const engine = createEngine(canvas);
    const quality = detectInitialLevel(engine); // 集显(UHD630 等)直接流畅档起步
    const scene = createScene(engine, theme);

    loading.setProgress(45, '搭建空间…');
    const shell = buildShell(scene, hall.walls, hall.meta, theme, hall.fixtures); // fixtures 供门洞挖墙

    loading.setProgress(60, '设置相机与光效…');
    const camera = createFirstPersonCamera(scene, canvas, hall.meta, shell);
    const fx = createPostFx(scene, camera, theme, quality !== 'low');
    setupMobileControls(scene, camera);

    loading.setProgress(75, '布置展品…');
    await buildFixtures(scene, hall, theme, shell, fx.glow);

    // 静态网格冻结(性能守护)
    for (const m of shell.staticMeshes) m.freezeWorldMatrix();

    // 质量自适应:集显按 GPU 探测直接流畅档,运行中 FPS 低再降(?quality= 可锁定)
    const qualityHandle = setupQuality(scene, engine, fx, quality);

    // 兜底看门狗:弱驱动(如 Microsoft Basic)uniform 块超限会让 shader 编译失败、
    // isReady 永远 false、加载条卡死 —— 12s 未就绪就强制流畅档(砍射灯/管线)重编重试
    setTimeout(() => {
      if (!scene.isReady()) {
        console.warn('[展厅] 场景迟迟未就绪(疑似 shader 编译失败),强制切流畅模式重试');
        qualityHandle.forceLow();
      }
    }, 12_000);

    loading.setProgress(90, '准备 VR…');
    await setupXR(scene, shell.floor);

    // 详情浮层 + 拾取(浮层打开时挂起相机控制)
    const overlay = new Overlay(theme.accent.toHexString());
    overlay.onOpenChange = (open) => {
      if (open) camera.detachControl();
      else camera.attachControl(canvas, true);
    };
    setupPicking(scene, canvas, (fx) => {
      // 门设了目标展厅 → 点击直接传送过去(展厅互通)
      if (fx.type === 'door') {
        const door = (fx.source?.content ?? {}) as { targetHallId?: string };
        if (door.targetHallId) {
          window.location.href = `${location.pathname}?hall=${encodeURIComponent(door.targetHallId)}`;
          return;
        }
      }
      overlay.show(fx);
    });
    setupHover(scene, canvas); // 悬停手型+标签:让「能点的东西」可见
    setupImmersiveUi(canvas); // 沉浸漫游按钮 + 锁定准星

    // ── 走近传送(用户直觉:走进门就到另一个厅,而不只是点门)──
    // 传送门 = 设了 targetHallId 的 door;人走到门洞中心 0.9m 内即跳转。
    // 顺带根治「外墙传送门走出去掉出世界」:人还没穿出墙就已被传走。
    const portals = hall.fixtures
      .filter((f) => f.type === 'door')
      .map((f) => ({
        x: f.x,
        z: f.y, // 归一化后平面 y 即世界 z
        target: ((f.source?.content ?? {}) as { targetHallId?: string }).targetHallId,
      }))
      .filter((p): p is { x: number; z: number; target: string } => !!p.target);
    let teleporting = false;
    let lastCheck = 0;
    const spawn = hall.meta.spawn ?? { x: 0, y: 0, rot: 0 };
    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      if (now - lastCheck < 150) return; // 节流:6~7 次/秒足够
      lastCheck = now;
      // 兜底:任何原因摔出世界(无目标的外墙门洞/碰撞缝隙)→ 回出生点,不无限下坠
      if (camera.position.y < -4) {
        camera.position.set(spawn.x, 1.7, spawn.y);
        console.warn('[展厅] 掉出场景,已传回出生点');
        return;
      }
      if (teleporting) return;
      for (const p of portals) {
        const dx = camera.position.x - p.x;
        const dz = camera.position.z - p.z;
        if (dx * dx + dz * dz < 0.9 * 0.9) {
          teleporting = true;
          window.location.href = `${location.pathname}?hall=${encodeURIComponent(p.target)}`;
          return;
        }
      }
    });

    engine.runRenderLoop(() => scene.render());
    scene.executeWhenReady(() => {
      loading.hide();
      showHint();
    });

    // 调试句柄:预览窗隐藏时手动 scene.render() 截 canvas / 生产排查用(场景对象本就在浏览器侧,无安全暴露)
    (window as unknown as Record<string, unknown>).__hallDebug = { engine, scene, camera };
  } catch (e) {
    console.error('[展厅] 加载失败:', e);
    loading.error(e instanceof Error ? e.message : '加载失败,请确认后端服务已启动');
  }
}

void boot();
