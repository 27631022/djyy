import {
  DualShockButton,
  DualShockPad,
  GenericPad,
  Xbox360Button,
  Xbox360Pad,
  type Scene,
} from '@babylonjs/core';
import type { Fixture } from '../types';

/**
 * 手柄按键点选:移动/转视角由 UniversalCamera 内置手柄输入提供(左摇杆移动、
 * 右摇杆视角),这里补「确认/取消」—— 配合屏幕中心准星(手柄连接即显示,
 * 见 ui/immersive.ts):
 *  - A(Xbox)/ ×(PS)/ 0 号键:瞄准的展品弹详情、瞄准的传送门直接穿门;
 *    详情已打开时再按 = 关闭(开/关一个键,单手可玩)。
 *  - B(Xbox)/ ○(PS)/ 1 号键:关闭详情。
 * 返回 confirm/cancel 供调试与将来键盘绑定复用。
 */
export interface GamepadSelectHandlers {
  confirm: () => void;
  cancel: () => void;
}

export function setupGamepadSelect(
  scene: Scene,
  opts: {
    onPick: (fx: Fixture) => void;
    isOverlayOpen: () => boolean;
    closeOverlay: () => void;
  },
): GamepadSelectHandlers {
  const pickCenter = () => {
    const engine = scene.getEngine();
    const pick = scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
    let node = pick?.pickedMesh ?? null;
    while (node) {
      const fx = (node.metadata as { fixture?: Fixture } | null)?.fixture;
      if (fx) {
        opts.onPick(fx);
        return;
      }
      node = node.parent as typeof node | null;
    }
  };
  const confirm = () => {
    if (opts.isOverlayOpen()) opts.closeOverlay();
    else pickCenter();
  };
  const cancel = () => {
    if (opts.isOverlayOpen()) opts.closeOverlay();
  };

  scene.gamepadManager.onGamepadConnectedObservable.add((gp) => {
    if (gp instanceof Xbox360Pad) {
      gp.onButtonDownObservable.add((b) => {
        if (b === Xbox360Button.A) confirm();
        else if (b === Xbox360Button.B) cancel();
      });
    } else if (gp instanceof DualShockPad) {
      gp.onButtonDownObservable.add((b) => {
        if (b === DualShockButton.Cross) confirm();
        else if (b === DualShockButton.Circle) cancel();
      });
    } else if (gp instanceof GenericPad) {
      gp.onButtonDownObservable.add((i) => {
        if (i === 0) confirm();
        else if (i === 1) cancel();
      });
    }
  });

  return { confirm, cancel };
}
