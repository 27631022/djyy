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

/** 按 GPU 粗判初始档:Intel 集显 → low,其余 → high(自适应仍会兜底降档) */
export function detectInitialLevel(engine: Engine): QualityLevel {
  const explicit = explicitQuality();
  if (explicit) return explicit;
  const renderer = engine.getGlInfo()?.renderer ?? '';
  if (/intel|uhd graphics|hd graphics|iris/i.test(renderer)) {
    console.info(`[展厅] 检测到集成显卡(${renderer}),流畅模式起步`);
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

  applyLevel(ctx, initial);
  if (explicitQuality()) return; // 显式指定 → 锁定,不自适应

  let idx = LEVELS.indexOf(initial);
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
