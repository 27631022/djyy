import { UniversalCamera, Vector3, type Scene } from '@babylonjs/core';
import type { HallMeta } from '../types';
import type { HallShell } from '../scene/wallBuilder';

const EYE_H = 1.7;
const DEG = Math.PI / 180;

/**
 * 第一人称漫游:W/S 前后 + A/D 左右转视角 + Q/E 横移(用户要求 A/D 与 Q/E 对调)
 * + 方向键(↑↓ 前后、←→ 横移)+ 鼠标(拖拽 / 点击进指针锁定)。
 * 碰撞椭球 + 重力贴地,穿不了墙飞不了天。
 * 朝向换算:spawn.rot 与 fixture 同约定(0=朝-Y);相机 forward=+Z → rotation.y = π - rot。
 */
export function createFirstPersonCamera(
  scene: Scene,
  canvas: HTMLCanvasElement,
  meta: HallMeta,
  shell: HallShell,
): UniversalCamera {
  const { bounds } = shell;
  const spawn = meta.spawn ?? {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    rot: 0,
  };

  const cam = new UniversalCamera('fp', new Vector3(spawn.x, EYE_H, spawn.y), scene);
  cam.rotation.y = Math.PI - (spawn.rot ?? 0) * DEG;
  cam.minZ = 0.1;
  cam.fov = 0.95;
  cam.speed = 0.18;
  cam.inertia = 0.75;
  cam.angularSensibility = 3200;
  cam.keysUp = [87, 38]; // W ↑
  cam.keysDown = [83, 40]; // S ↓
  cam.keysLeft = [81, 37]; // Q ← 左横移
  cam.keysRight = [69, 39]; // E → 右横移
  cam.keysRotateLeft = [65]; // A 左转视角
  cam.keysRotateRight = [68]; // D 右转视角
  // 转向速度用内置默认 0.5 rad/s:经 cameraRotation 惯性缓冲放大 1/(1-inertia)=4 倍,
  // 等效 ≈115°/s,正合适 —— 别再调大(实测 2.0 会到 ~450°/s 晕头转向)
  cam.checkCollisions = true;
  cam.applyGravity = true;
  cam.ellipsoid = new Vector3(0.38, 0.85, 0.38);
  cam.attachControl(canvas, true);

  // 桌面端默认「鼠标可见 + 拖拽转视角」(内置 mouse input),对办公人群更友好;
  // 指针锁定(沉浸模式)由右下角按钮自愿进入(见 ui/immersive.ts),这里只挂锁定后的视角控制
  const isTouch = 'ontouchstart' in window;
  if (!isTouch) {
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      cam.rotation.y += e.movementX / 700;
      cam.rotation.x = Math.max(-1.25, Math.min(1.25, cam.rotation.x + e.movementY / 700));
    });
  }
  return cam;
}
