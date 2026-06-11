import type { GlowLayer, Scene } from '@babylonjs/core';
import type { Fixture, ResolvedHall, Text3dContent, TypefaceFontSubset } from '../types';
import type { ThemeParams } from '../theme/presets';
import type { HallShell } from '../scene/wallBuilder';
import { hallApi } from '../api/hallApi';
import { addSpotFor } from './fixtureUtils';
import { buildImageCase, type BuiltFixture } from './imageCaseBuilder';
import { buildVideoWall } from './videoWallBuilder';
import { buildModelStand } from './modelStandBuilder';
import { buildHonorWall } from './honorWallBuilder';
import { buildNoticeBoard } from './noticeBoardBuilder';
import { buildDoor } from './doorBuilder';
import { buildText3d } from './text3dBuilder';
import { buildDecor } from './decorBuilder';

/** 全厅 text_3d 文本去重字符(一次请求拿齐字体子集) */
function collectChars(fixtures: Fixture[]): string {
  const set = new Set<string>();
  for (const fx of fixtures) {
    if (fx.type !== 'text_3d') continue;
    const c = (fx.source.content ?? {}) as Text3dContent;
    for (const ch of c.text ?? fx.label ?? '') {
      if (ch.trim()) set.add(ch);
    }
  }
  return [...set].join('');
}

/** 按类型分发构建全部组件;展示类组件自动配「射灯+光锥」 */
export async function buildFixtures(
  scene: Scene,
  hall: ResolvedHall,
  theme: ThemeParams,
  shell: HallShell,
  glow: GlowLayer,
): Promise<void> {
  // 中文 3D 文字字体子集(失败回退平面字,不阻塞)
  let fontData: TypefaceFontSubset | null = null;
  const chars = collectChars(hall.fixtures);
  if (chars) {
    try {
      fontData = await hallApi.font(chars);
    } catch (e) {
      console.warn('[展厅] 字体子集获取失败,3D 文字回退平面字:', e);
    }
  }

  for (const fx of hall.fixtures) {
    let built: BuiltFixture | null = null;
    switch (fx.type) {
      case 'image_case':
        built = buildImageCase(scene, fx, theme);
        break;
      case 'video_wall':
        built = buildVideoWall(scene, fx, theme);
        break;
      case 'model_stand':
        built = buildModelStand(scene, fx, theme);
        break;
      case 'honor_wall':
        built = buildHonorWall(scene, fx, theme);
        break;
      case 'notice_board':
        built = buildNoticeBoard(scene, fx, theme);
        break;
      case 'door':
        built = buildDoor(scene, fx, theme);
        break;
      case 'text_3d':
        built = buildText3d(scene, fx, fontData, theme, shell.wallH);
        break;
      case 'decor':
        built = buildDecor(scene, fx, theme);
        break;
      default:
        console.warn(`[展厅] 未知组件类型:${fx.type as string}(${fx.id})`);
    }
    // 展示类组件配射灯(光只作用展品+地板;光锥排除出 GlowLayer 防泛光)
    if (built?.spotTargets?.length) {
      const { cone } = addSpotFor(scene, fx, theme, {
        wallH: shell.wallH,
        floor: shell.floor,
        targets: built.spotTargets,
      });
      glow.addExcludedMesh(cone);
    }
  }
}
