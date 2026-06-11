import { Engine } from '@babylonjs/core';

/**
 * Engine + DPR 适配 + resize。
 * antialias=false:高/中档用 FXAA(后处理),低档为流畅放弃 AA ——
 * MSAA 在 UHD630 这类集显上是无谓的大头,任何档位都用不到。
 * powerPreference 'high-performance':双显卡机器请浏览器优先分配独显
 * (网页只能「请求」,最终归属仍由 系统显卡设置/浏览器 决定;
 * 强制指定要在 Windows 设置→系统→屏幕→显示卡 里给浏览器选「高性能」)。
 */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, false, {
    stencil: true,
    powerPreference: 'high-performance',
  });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  engine.setHardwareScalingLevel(1 / dpr);
  window.addEventListener('resize', () => engine.resize());
  return engine;
}
