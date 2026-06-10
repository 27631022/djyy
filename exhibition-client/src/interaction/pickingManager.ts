import { PointerEventTypes, type Scene } from '@babylonjs/core';
import type { Fixture } from '../types';

/**
 * 射线拾取:POINTERTAP(拖拽转视角不会误触)→ 沿父链找 metadata.fixture。
 * 指针锁定时改取屏幕中心(准星位置)。
 */
export function setupPicking(
  scene: Scene,
  canvas: HTMLCanvasElement,
  onPick: (fx: Fixture) => void,
): void {
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERTAP) return;
    const engine = scene.getEngine();
    const locked = document.pointerLockElement === canvas;
    const pick = locked
      ? scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2)
      : pi.pickInfo;
    let node = pick?.pickedMesh ?? null;
    while (node) {
      const fx = (node.metadata as { fixture?: Fixture } | null)?.fixture;
      if (fx) {
        onPick(fx);
        return;
      }
      node = node.parent as typeof node | null;
    }
  });
}
