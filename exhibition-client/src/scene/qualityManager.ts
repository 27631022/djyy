import type {
  DefaultRenderingPipeline,
  Engine,
  GlowLayer,
  Scene,
} from '@babylonjs/core';

/**
 * 质量自适应:办公机(集显)跑不动全特效时自动降级,保「能流畅走」优先。
 *
 * 三档:
 *   high   全特效:DPR≤1.75、bloom+vignette+glow+光锥
 *   medium DPR≤1.25、关 bloom、glow 减半
 *   low    DPR=1、关 bloom/vignette/glow/光锥/FXAA(纯净快速)
 *
 * 策略:默认 high 起步;每 2s 采样 FPS,连续 3 次 < 28 → 降一档(只降不升,防抖动)。
 * URL ?quality=high|medium|low 显式指定则锁定不自适应。
 */
export type QualityLevel = 'high' | 'medium' | 'low';

const LEVELS: QualityLevel[] = ['high', 'medium', 'low'];

interface QualityCtx {
  scene: Scene;
  engine: Engine;
  pipeline: DefaultRenderingPipeline;
  glow: GlowLayer;
  glowBaseIntensity: number;
}

function applyLevel(ctx: QualityCtx, level: QualityLevel): void {
  const { scene, engine, pipeline, glow } = ctx;
  const dpr = window.devicePixelRatio || 1;
  const dprCap = level === 'high' ? 1.75 : level === 'medium' ? 1.25 : 1;
  engine.setHardwareScalingLevel(1 / Math.min(dpr, dprCap));

  pipeline.bloomEnabled = level === 'high';
  pipeline.imageProcessing.vignetteEnabled = level !== 'low';
  pipeline.fxaaEnabled = level !== 'low';

  glow.intensity =
    level === 'high'
      ? ctx.glowBaseIntensity
      : level === 'medium'
        ? ctx.glowBaseIntensity * 0.5
        : 0;

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
  pipeline: DefaultRenderingPipeline,
  glow: GlowLayer,
): void {
  const ctx: QualityCtx = { scene, engine, pipeline, glow, glowBaseIntensity: glow.intensity };

  // 显式指定 → 锁定
  const param = new URLSearchParams(location.search).get('quality');
  if (param === 'high' || param === 'medium' || param === 'low') {
    applyLevel(ctx, param);
    return;
  }

  let idx = 0; // high 起步
  applyLevel(ctx, LEVELS[idx]);

  let slowStreak = 0;
  const timer = setInterval(() => {
    if (document.hidden) return; // 后台标签 FPS 失真,不计
    const fps = engine.getFps();
    if (fps < 28) {
      slowStreak++;
      if (slowStreak >= 3 && idx < LEVELS.length - 1) {
        idx++;
        applyLevel(ctx, LEVELS[idx]);
        showToast(idx === 1 ? '已自动优化画质以保流畅' : '已切换流畅模式');
        slowStreak = 0;
        if (idx === LEVELS.length - 1) clearInterval(timer); // 降到底,停止监测
      }
    } else {
      slowStreak = 0;
    }
  }, 2000);
}
