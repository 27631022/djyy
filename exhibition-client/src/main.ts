import '@babylonjs/loaders/glTF'; // 副作用注册 .glb 加载器(model_stand)
import type { FreeCameraGamepadInput } from '@babylonjs/core';
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
import { setupGamepadSelect } from './interaction/gamepadSelect';
import { Overlay } from './interaction/overlay';
import { createGuideNarrator, type GuideNarrator } from './guide/guideNarrator';
import { LoadingScreen, showHint } from './ui/loadingScreen';
import { persistImmersiveAcrossNav, setupImmersiveUi } from './ui/immersive';
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

    // 跨厅传送统一入口:沉浸态(指针锁定)先记进 sessionStorage,下一厅延续
    const goHall = (target: string) => {
      persistImmersiveAcrossNav(canvas);
      window.location.href = `${location.pathname}?hall=${encodeURIComponent(target)}`;
    };

    // 详情浮层 + 拾取(浮层打开时挂起相机控制)
    const overlay = new Overlay(theme.accent.toHexString());
    // ⚠ 用「状态转换」守卫:onOpenChange 可能重复触发(全屏视频 fsClose + hide 都发 false),
    // 不守卫会重复 attachControl → 相机手柄/键鼠输入监听重复挂载,几次后摇杆/移动失灵。
    // 保证一次 detach 对一次 attach。
    let camDetached = false;
    // detach/attach 后,相机的手柄输入(FreeCameraGamepadInput)可能没重新拿到已连接的手柄
    // → 左摇杆移动/右摇杆视角失灵,而 A/B 走 scene.gamepadManager 仍有效(=「确认有反应、方向没反应」)。
    // attach 后把当前手柄重新塞回相机手柄输入(已绑定则 no-op)。
    const refreshCameraGamepad = () => {
      const gi = camera.inputs.attached.gamepad as FreeCameraGamepadInput | undefined;
      if (gi && !gi.gamepad) {
        gi.gamepad = scene.gamepadManager.gamepads.find((p) => p) ?? null;
      }
    };
    overlay.onOpenChange = (open) => {
      if (open && !camDetached) {
        camera.detachControl();
        camDetached = true;
      } else if (!open && camDetached) {
        camera.attachControl(canvas, true);
        camDetached = false;
        refreshCameraGamepad();
      }
    };
    // 在线解说员「党建小益」(厅级启用):进厅即站在迎宾位常驻可见,有解说词的展品点击时滑过去讲解
    let guide: GuideNarrator | null = null;
    // 彻底关闭:详情浮层 / 全屏视频 + 讲解一起关(手柄 B / 字幕「关闭」/ ESC 用)
    const closeAll = () => {
      overlay.hide();
      guide?.close();
    };
    guide = hall.meta.guide?.enabled
      ? createGuideNarrator(scene, camera, hall.meta.guide, theme, {
          onDetail: (f) => overlay.show(f),
          spawn: { x: hall.meta.spawn?.x ?? 0, y: hall.meta.spawn?.y ?? 0 },
          walls: shell.staticMeshes, // 站位避让:右侧被墙挡则改左侧(水平射线只会命中墙)
          onRequestCloseAll: closeAll,
        })
      : null;
    // 鼠标点击 / 手柄 A 共用的拾取处理:
    //   门 → 传送 / 普通门开详情;
    //   有解说词:首次点 → 小益过来讲解;再点同一展品 → 查看大图/详情(可翻页);
    //   无解说词 → 解说员不跟来,直接开详情浮层。
    const handleFixturePick = (fx: (typeof hall.fixtures)[number]) => {
      if (fx.type === 'door') {
        const door = (fx.source?.content ?? {}) as { targetHallId?: string };
        if (door.targetHallId) goHall(door.targetHallId);
        else overlay.show(fx);
        return;
      }
      const n = fx.narration;
      const hasNarration = !!guide && !!(n?.text?.trim() || n?.audioUrl);
      if (hasNarration && guide) {
        if (guide.narratingId() === fx.id) overlay.show(fx); // 再次点击同一展品 → 大图/详情
        else guide.narrate(fx); // 首次 → 讲解
      } else {
        overlay.show(fx); // 无解说词:不打扰,直接看详情
      }
    };
    setupPicking(scene, canvas, handleFixturePick);
    // 手柄:A 瞄准确认(浮层开着=回退一层;否则拾取/讲解→大图),B 彻底关闭,D-pad 左右翻照片
    const gamepad = setupGamepadSelect(scene, {
      onPick: handleFixturePick,
      isOverlayOpen: () => overlay.isOpen(),
      closeOverlay: () => overlay.hide(),
      closeAll,
      page: (dir) => overlay.page(dir),
      canPage: () => overlay.isOpen() && overlay.canPage(),
    });
    setupHover(scene, canvas); // 悬停手型+标签:让「能点的东西」可见(瞄准模式=准星下方)
    setupImmersiveUi(canvas); // 沉浸漫游按钮 + 准星(锁定/手柄/跨厅延续)

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
          goHall(p.target);
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
    (window as unknown as Record<string, unknown>).__hallDebug = { engine, scene, camera, gamepad, guide, overlay, pick: handleFixturePick };
  } catch (e) {
    console.error('[展厅] 加载失败:', e);
    loading.error(e instanceof Error ? e.message : '加载失败,请确认后端服务已启动');
  }
}

void boot();
