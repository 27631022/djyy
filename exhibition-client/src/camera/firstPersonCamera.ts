import { UniversalCamera, Vector3, type Scene } from '@babylonjs/core';
import type { HallMeta } from '../types';
import type { HallShell } from '../scene/wallBuilder';

const EYE_H = 1.7;
const DEG = Math.PI / 180;

/**
 * 第一人称漫游:WASD/方向键 + 鼠标(拖拽 / 点击进指针锁定)。
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
  cam.keysLeft = [65, 37]; // A ←
  cam.keysRight = [68, 39]; // D →
  cam.checkCollisions = true;
  cam.applyGravity = true;
  cam.ellipsoid = new Vector3(0.38, 0.85, 0.38);
  cam.attachControl(canvas, true);

  // 桌面端:点击画布进指针锁定,移动鼠标即转视角(ESC 自动退出)
  const isTouch = 'ontouchstart' in window;
  if (!isTouch) {
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      cam.rotation.y += e.movementX / 700;
      cam.rotation.x = Math.max(-1.25, Math.min(1.25, cam.rotation.x + e.movementY / 700));
    });
  }
  return cam;
}
