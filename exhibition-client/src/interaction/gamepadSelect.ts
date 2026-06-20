import {
  DualShockButton,
  DualShockDpad,
  DualShockPad,
  GenericPad,
  Xbox360Button,
  Xbox360Dpad,
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
    /** 详情卡 或 全屏视频 是否开着 */
    isOverlayOpen: () => boolean;
    /** A 键在「开着」时:回退一层(关大图/退出全屏视频) */
    closeOverlay: () => void;
    /** B 键:彻底关闭(详情 + 讲解一起) */
    closeAll: () => void;
    /** 翻页(D-pad 左右) */
    page: (dir: number) => void;
    /** 当前是否有可翻页图集且浮层开着 */
    canPage: () => boolean;
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
  // A:浮层开着 → 回退一层(关大图/退出全屏视频);否则瞄准拾取(首次讲解 / 再次=大图)
  const confirm = () => {
    if (opts.isOverlayOpen()) opts.closeOverlay();
    else pickCenter();
  };
  // B:彻底关闭(详情 + 讲解)
  const cancel = () => opts.closeAll();
  // D-pad 左右:浮层开着且有图集时翻页
  const pageIf = (dir: number) => {
    if (opts.canPage()) opts.page(dir);
  };

  scene.gamepadManager.onGamepadConnectedObservable.add((gp) => {
    if (gp instanceof Xbox360Pad) {
      gp.onButtonDownObservable.add((b) => {
        if (b === Xbox360Button.A) confirm();
        else if (b === Xbox360Button.B) cancel();
      });
      gp.onPadDownObservable.add((d) => {
        if (d === Xbox360Dpad.Left) pageIf(-1);
        else if (d === Xbox360Dpad.Right) pageIf(1);
      });
    } else if (gp instanceof DualShockPad) {
      gp.onButtonDownObservable.add((b) => {
        if (b === DualShockButton.Cross) confirm();
        else if (b === DualShockButton.Circle) cancel();
      });
      gp.onPadDownObservable.add((d) => {
        if (d === DualShockDpad.Left) pageIf(-1);
        else if (d === DualShockDpad.Right) pageIf(1);
      });
    } else if (gp instanceof GenericPad) {
      gp.onButtonDownObservable.add((i) => {
        if (i === 0) confirm();
        else if (i === 1) cancel();
        else if (i === 14) pageIf(-1); // 标准手柄映射:D-pad 左
        else if (i === 15) pageIf(1); // D-pad 右
      });
    }
  });

  return { confirm, cancel };
}
