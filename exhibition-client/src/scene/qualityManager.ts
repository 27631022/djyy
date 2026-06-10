import type { Engine, Scene } from '@babylonjs/core';
import type { PostFx } from './sceneSetup';

/**
 * 质量自适应 —— 目标硬件:单位标配 i5-10500 + UHD630 集显。
 *
 * 三档(关键差异在「渲染 pass 数」,不只是开关):
 *   high   DPR≤1.75;后处理管线(FXAA+bloom+vignette)+ 辉光层 + 射灯/光锥
 *   medium DPR≤1.25;管线保留(关 bloom)+ 辉光减半 + 射灯/光锥
 *   low    DPR≤0.9;**无后处理管线、辉光层停用(不再渲染 pass)、射灯禁用、
 *          光锥隐藏** —— 场景直出 backbuffer,纯前向 PBR,UHD630 可流畅;
 *          ACES 色调映射由材质内联(场景级 image processing),观感不塌。
 *
 * 初始档:按 GPU renderer 字符串粗判 —— Intel 集显(UHD/HD Graphics/Iris)
 * 直接 low 起步(免得卡 6 秒再降),独显/Apple 从 high 起步。
 * 运行中每 2s 采样 FPS,连续 3 次 < 28 再降档(只降不升防抖动)。
 * URL ?quality=high|medium|low 显式指定则锁定。
 */
export type QualityLevel = 'high' | 'medium' | 'low';

const LEVELS: QualityLevel[] = ['high', 'medium', 'low'];

/** URL 显式指定(锁定),无则 null */
export function explicitQuality(): QualityLevel | null {
  const p = new URLSearchParams(location.search).get('quality');
  return p === 'high' || p === 'medium' || p === 'low' ? p : null;
}

/** CPU 软渲染警示横幅:SwiftShader 下显卡没干活,代码优化无解,引导用户开硬件加速 */
function showSoftwareRenderBanner(): void {
  const bar = document.createElement('div');
  bar.style.cssText = `position:fixed;left:0;right:0;top:0;z-index:70;display:flex;
    align-items:center;justify-content:center;gap:14px;padding:10px 16px;
    background:#B45309;color:#fff;font:13px/1.6 'Microsoft YaHei',sans-serif;`;
  bar.innerHTML = `⚠ 检测到浏览器<b>未启用硬件加速</b>,显卡未工作,3D 画面会很卡。
    请打开 浏览器设置 → 系统 → 开启「使用图形加速/硬件加速」,重启浏览器后再访问。
    (若已开启仍出现此提示,请更新显卡驱动)`;
  const x = document.createElement('button');
  x.textContent = '×';
  x.style.cssText = 'border:none;background:rgba(255,255,255,.2);color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;';
  x.onclick = () => bar.remove();
  bar.appendChild(x);
  document.body.appendChild(bar);
}

/**
 * 按 GPU 粗判初始档:
 * - SwiftShader/软渲染 → low + 警示横幅(显卡没启用,任何优化都救不了)
 * - Intel 集显 → low 起步;独显/Apple → high(自适应仍兜底降档)
 */
export function detectInitialLevel(engine: Engine): QualityLevel {
  const explicit = explicitQuality();
  if (explicit) return explicit;
  const renderer = engine.getGlInfo()?.renderer ?? '';
  console.info(`[展厅] GPU: ${renderer || '(未知)'}`);
  if (/swiftshader|software|llvmpipe/i.test(renderer)) {
    console.warn('[展厅] 浏览器在用 CPU 软件渲染(硬件加速未启用),性能会极差');
    showSoftwareRenderBanner();
    return 'low';
  }
  if (/intel|uhd graphics|hd graphics|iris/i.test(renderer)) {
    console.info('[展厅] 检测到集成显卡,流畅模式起步');
    return 'low';
  }
  return 'high';
}

interface QualityCtx {
  scene: Scene;
  engine: Engine;
  fx: PostFx;
  glowBase: number;
}

function applyLevel(ctx: QualityCtx, level: QualityLevel): void {
  const { scene, engine, fx } = ctx;
  const dpr = window.devicePixelRatio || 1;
  const dprCap = level === 'high' ? 1.75 : level === 'medium' ? 1.25 : 0.9;
  engine.setHardwareScalingLevel(1 / Math.min(dpr, dprCap));

  if (level === 'low') {
    // 砍 pass:管线整体销毁(场景直出)、辉光层停渲染
    if (fx.pipeline) {
      fx.pipeline.dispose();
      fx.pipeline = null;
    }
    fx.glow.isEnabled = false;
  } else if (fx.pipeline) {
    fx.pipeline.bloomEnabled = level === 'high';
    fx.pipeline.fxaaEnabled = true;
    fx.pipeline.imageProcessing.vignetteEnabled = true;
    fx.glow.isEnabled = true;
    fx.glow.intensity = level === 'high' ? ctx.glowBase : ctx.glowBase * 0.5;
  }

  // 展品射灯(spot: 前缀)逐像素开销大,low 档整体禁用(亮度交给半球光+IBL)
  for (const l of scene.lights) {
    if (l.name.startsWith('spot:')) l.setEnabled(level !== 'low');
  }
  // 假体积光锥(cone: 前缀)纯装饰,low 档隐藏省 overdraw
  for (const m of scene.meshes) {
    if (m.name.startsWith('cone:')) m.setEnabled(level !== 'low');
  }
  console.info(`[展厅] 画质档位: ${level}`);
}

/** FPS 角标:按 F 键显隐;显示 帧率 / 当前档位 / 显卡(诊断用,默认隐藏不碍展示) */
function setupFpsMeter(engine: Engine, getLevel: () => QualityLevel): void {
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:14px;top:14px;z-index:60;display:none;
    background:rgba(12,12,16,.78);color:#9fe870;padding:8px 14px;border-radius:8px;
    font:12px/1.7 Consolas,monospace;pointer-events:none;white-space:pre;`;
  document.body.appendChild(box);
  const renderer = engine.getGlInfo()?.renderer ?? '未知';
  setInterval(() => {
    if (box.style.display === 'none') return;
    box.textContent = `FPS  ${engine.getFps().toFixed(0)}\n档位 ${getLevel()}\nGPU  ${renderer.slice(0, 48)}`;
  }, 500);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
  });
}

function showToast(text: string): void {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:60;
    background:rgba(20,20,26,.8);color:#fff;padding:8px 18px;border-radius:18px;
    font:13px 'Microsoft YaHei',sans-serif;transition:opacity .8s;`;
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 900);
  }, 2600);
}

export function setupQuality(
  scene: Scene,
  engine: Engine,
  fx: PostFx,
  initial: QualityLevel,
): void {
  const ctx: QualityCtx = { scene, engine, fx, glowBase: fx.glow.intensity };

  let idx = LEVELS.indexOf(initial);
  applyLevel(ctx, initial);
  setupFpsMeter(engine, () => LEVELS[idx]); // 按 F 显隐帧率角标

  if (explicitQuality()) return; // 显式指定 → 锁定,不自适应
  if (idx >= LEVELS.length - 1) return; // low 起步,无可再降

  let slowStreak = 0;
  const timer = setInterval(() => {
    if (document.hidden) return; // 后台标签 FPS 失真,不计
    const fps = engine.getFps();
    if (fps < 28) {
      slowStreak++;
      if (slowStreak >= 3) {
        idx++;
        applyLevel(ctx, LEVELS[idx]);
        showToast(idx === 1 ? '已自动优化画质以保流畅' : '已切换流畅模式');
        slowStreak = 0;
        if (idx === LEVELS.length - 1) clearInterval(timer);
      }
    } else {
      slowStreak = 0;
    }
  }, 2000);
}
