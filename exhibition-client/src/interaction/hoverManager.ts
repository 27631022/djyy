import { PointerEventTypes, type Scene } from '@babylonjs/core';
import type { Fixture } from '../types';

/**
 * 悬停反馈:鼠标移到展品上 → 光标变手型 + 跟随小标签「⊕ 荣誉墙」,
 * 让"哪些东西能点"一目了然(用户反馈:看不出哪里可点)。
 * 指针锁定(沉浸模式)时改用屏幕中心拾取,标签固定在准星下方。
 * 零渲染开销(纯 DOM + 节流射线)。
 */
export function setupHover(scene: Scene, canvas: HTMLCanvasElement): void {
  const tip = document.createElement('div');
  tip.style.cssText = `position:fixed;z-index:24;pointer-events:none;display:none;
    background:rgba(20,20,26,.78);color:#fff;padding:5px 12px;border-radius:14px;
    font:12px 'Microsoft YaHei',sans-serif;letter-spacing:.04em;white-space:nowrap;
    transform:translate(-50%,0);backdrop-filter:blur(3px);`;
  document.body.appendChild(tip);

  const pickFixture = (x: number, y: number): Fixture | null => {
    const pick = scene.pick(x, y);
    let node = pick?.pickedMesh ?? null;
    while (node) {
      const fx = (node.metadata as { fixture?: Fixture } | null)?.fixture;
      if (fx) return fx;
      node = node.parent as typeof node | null;
    }
    return null;
  };

  let lastCheck = 0;
  const update = () => {
    const now = performance.now();
    if (now - lastCheck < 80) return; // 节流,拾取射线不必每帧
    lastCheck = now;

    const engine = scene.getEngine();
    const locked = document.pointerLockElement === canvas;
    const px = locked ? engine.getRenderWidth() / 2 : scene.pointerX;
    const py = locked ? engine.getRenderHeight() / 2 : scene.pointerY;
    const fx = pickFixture(px, py);

    if (fx) {
      if (!locked) canvas.style.cursor = 'pointer';
      tip.textContent = `⊕ ${fx.label ?? '查看详情'}`;
      tip.style.display = 'block';
      if (locked) {
        tip.style.left = '50%';
        tip.style.top = 'calc(50% + 26px)';
      } else {
        const rect = canvas.getBoundingClientRect();
        const scale = rect.width / engine.getRenderWidth();
        tip.style.left = `${rect.left + scene.pointerX * scale}px`;
        tip.style.top = `${rect.top + scene.pointerY * scale + 22}px`;
      }
    } else {
      canvas.style.cursor = 'default';
      tip.style.display = 'none';
    }
  };

  scene.onPointerObservable.add((pi) => {
    if (pi.type === PointerEventTypes.POINTERMOVE) update();
  });
  // 沉浸模式下转视角也要刷新中心拾取
  scene.onBeforeRenderObservable.add(() => {
    if (document.pointerLockElement === canvas) update();
  });
}
