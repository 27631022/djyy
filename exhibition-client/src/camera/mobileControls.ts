import { Vector3, type Scene, type UniversalCamera } from '@babylonjs/core';

/**
 * 移动端虚拟摇杆:左下角圆盘控制前进/平移(右手拖屏转视角走相机内置 touch 输入)。
 * 摇杆 DOM 截获 pointer 事件不传给画布;cameraDirection 走碰撞系统,不穿墙。
 */
export function setupMobileControls(scene: Scene, camera: UniversalCamera): void {
  if (!('ontouchstart' in window)) return;

  const pad = document.createElement('div');
  pad.style.cssText = `position:fixed;left:22px;bottom:26px;width:120px;height:120px;
    border-radius:50%;background:rgba(255,255,255,.10);border:1.5px solid rgba(255,255,255,.28);
    touch-action:none;z-index:30;backdrop-filter:blur(2px);`;
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;
    background:rgba(255,255,255,.45);transform:translate(-50%,-50%);transition:transform .05s;`;
  pad.appendChild(knob);
  document.body.appendChild(pad);

  let vec = { x: 0, y: 0 };
  let activeId: number | null = null;

  const updateFromEvent = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, max);
    vec = { x: (dx / len) * (cl / max), y: (dy / len) * (cl / max) };
    knob.style.transform = `translate(calc(-50% + ${(vec.x * max) / 2}px), calc(-50% + ${(vec.y * max) / 2}px))`;
  };
  pad.addEventListener('pointerdown', (e) => {
    activeId = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    updateFromEvent(e);
    e.preventDefault();
    e.stopPropagation();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    updateFromEvent(e);
    e.preventDefault();
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    vec = { x: 0, y: 0 };
    knob.style.transform = 'translate(-50%,-50%)';
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  scene.onBeforeRenderObservable.add(() => {
    if (!vec.x && !vec.y) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const speed = 2.4 * dt; // 米/秒
    const fwd = camera.getDirection(Vector3.Forward());
    fwd.y = 0;
    fwd.normalize();
    const right = camera.getDirection(Vector3.Right());
    right.y = 0;
    right.normalize();
    // 摇杆上推(y<0)=前进
    camera.cameraDirection.addInPlace(
      fwd.scale(-vec.y * speed).add(right.scale(vec.x * speed)),
    );
  });
}
