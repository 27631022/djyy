import { Engine } from '@babylonjs/core';

/** Engine + DPR 适配(上限 2,防 3x 屏掉帧)+ resize */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, { stencil: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  engine.setHardwareScalingLevel(1 / dpr);
  window.addEventListener('resize', () => engine.resize());
  return engine;
}
