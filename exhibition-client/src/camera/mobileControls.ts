import { Vector3, type FreeCameraTouchInput, type Scene, type UniversalCamera } from '@babylonjs/core';

/**
 * 移动端虚拟摇杆:左下角圆盘控制前进/平移(右手拖屏转视角走相机内置 touch 输入)。
 * 摇杆 DOM 截获 pointer 事件不传给画布;cameraDirection 走碰撞系统,不穿墙。
 *
 * 手感调校(2026-06-12 用户实测反馈):
 * - 拖屏转向:内置 touchAngularSensibility 默认 200000 慢到没法用(≈7°/s)→ 先调
 *   13500(≈100°/s)用户仍嫌慢,再调 8000(100px 持划 ≈170°/s);单指改纯转向
 *   singleFingerRotate(默认竖划是前后移动,与摇杆功能重复还容易误触,改后
 *   竖划=抬头低头,配俯仰限位防翻转)。
 * - 摇杆速度:cameraDirection 被相机惯性(inertia 0.75)累积放大 1/(1-0.75)=4 倍,
 *   旧值 2.4*dt 实际 ≈9.6 米/秒(冲刺)→ 0.5*dt(实际 ≈2 米/秒,快走);
 *   并加二次响应曲线(轻推微调、推满才全速)+ 死区防抖。
 */
export function setupMobileControls(scene: Scene, camera: UniversalCamera): void {
  if (!('ontouchstart' in window)) return;

  // 拖屏转向:单指 = 纯转视角(横划转向 + 竖划俯仰),灵敏度调到可用区间
  const touch = camera.inputs.attached.touch as FreeCameraTouchInput | undefined;
  if (touch) {
    touch.singleFingerRotate = true;
    touch.touchAngularSensibility = 8000;
  }

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
    const raw = Math.min(len, max) / max; // 0~1 偏移量
    // 死区防抖 + 二次响应曲线:轻推走得很慢便于微调,推满才到全速
    const mag = raw < 0.12 ? 0 : ((raw - 0.12) / 0.88) ** 2;
    vec = { x: (dx / len) * mag, y: (dy / len) * mag };
    knob.style.transform = `translate(calc(-50% + ${((dx / len) * raw * max) / 2}px), calc(-50% + ${((dy / len) * raw * max) / 2}px))`;
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
    // 俯仰限位:单指转向开放抬头低头后,防止翻过头顶/脚底
    camera.rotation.x = Math.max(-1.1, Math.min(1.1, camera.rotation.x));
    if (!vec.x && !vec.y) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const speed = 0.5 * dt; // 经 inertia 4 倍累积后 ≈2 米/秒(快走),勿直接当米/秒读
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
