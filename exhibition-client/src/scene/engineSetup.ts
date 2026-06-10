import { Engine } from '@babylonjs/core';

/**
 * Engine + DPR 适配 + resize。
 * antialias=false:高/中档用 FXAA(后处理),低档为流畅放弃 AA ——
 * MSAA 在 UHD630 这类集显上是无谓的大头,任何档位都用不到。
 */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, false, { stencil: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  engine.setHardwareScalingLevel(1 / dpr);
  window.addEventListener('resize', () => engine.resize());
  return engine;
}
