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
    const shell = buildShell(scene, hall.walls, hall.meta, theme);

    loading.setProgress(60, '设置相机与光效…');
    const camera = createFirstPersonCamera(scene, canvas, hall.meta, shell);
    const fx = createPostFx(scene, camera, theme, quality !== 'low');
    setupMobileControls(scene, camera);

    loading.setProgress(75, '布置展品…');
    await buildFixtures(scene, hall, theme, shell, fx.glow);

    // 静态网格冻结(性能守护)
    for (const m of shell.staticMeshes) m.freezeWorldMatrix();

    // 质量自适应:集显按 GPU 探测直接流畅档,运行中 FPS 低再降(?quality= 可锁定)
    setupQuality(scene, engine, fx, quality);

    loading.setProgress(90, '准备 VR…');
    await setupXR(scene, shell.floor);

    // 详情浮层 + 拾取(浮层打开时挂起相机控制)
    const overlay = new Overlay(theme.accent.toHexString());
    overlay.onOpenChange = (open) => {
      if (open) camera.detachControl();
      else camera.attachControl(canvas, true);
    };
    setupPicking(scene, canvas, (fx) => overlay.show(fx));
    setupHover(scene, canvas); // 悬停手型+标签:让「能点的东西」可见
    setupImmersiveUi(canvas); // 沉浸漫游按钮 + 锁定准星

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
