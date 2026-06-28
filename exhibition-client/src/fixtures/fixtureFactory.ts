import type { GlowLayer, Scene } from '@babylonjs/core';
import type { Fixture, ResolvedHall, Text3dContent, TypefaceFontSubset, WallDecorContent } from '../types';
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
import { buildText3d, fontKeyOf } from './text3dBuilder';
import { buildDecor } from './decorBuilder';
import { buildCeilingSign } from './ceilingSignBuilder';
import { buildWallDecor, wallDecorFontKey, wallDecorTitleOf } from './wallDecorBuilder';
import { buildFlag } from './flagBuilder';

/** 全厅挤出文字(text_3d + 文化墙标题)按「字体 key」分组去重字符(每种字体一次请求) */
function collectCharsByFont(fixtures: Fixture[]): Map<string, string> {
  const groups = new Map<string, Set<string>>();
  const eat = (key: string, text: string) => {
    let set = groups.get(key);
    if (!set) {
      set = new Set();
      groups.set(key, set);
    }
    for (const ch of text) {
      if (ch.trim()) set.add(ch);
    }
  };
  for (const fx of fixtures) {
    if (fx.type === 'text_3d') {
      const c = (fx.source.content ?? {}) as Text3dContent;
      eat(fontKeyOf(c), c.text ?? fx.label ?? '');
    } else if (fx.type === 'wall_decor') {
      const c = (fx.source.content ?? {}) as WallDecorContent;
      eat(wallDecorFontKey(c), wallDecorTitleOf(c));
    }
  }
  const out = new Map<string, string>();
  for (const [key, set] of groups) {
    if (set.size > 0) out.set(key, [...set].join(''));
  }
  return out;
}

/** 按类型分发构建全部组件;展示类组件自动配「射灯+光锥」 */
export async function buildFixtures(
  scene: Scene,
  hall: ResolvedHall,
  theme: ThemeParams,
  shell: HallShell,
  glow: GlowLayer,
): Promise<void> {
  // 中文 3D 文字字体子集:按字体 key 分组并行取(失败该组回退平面字,不阻塞)
  const fonts = new Map<string, TypefaceFontSubset>();
  await Promise.all(
    [...collectCharsByFont(hall.fixtures)].map(async ([key, chars]) => {
      try {
        fonts.set(key, await hallApi.font(chars, key));
      } catch (e) {
        console.warn(`[展厅] 字体子集获取失败(${key}),该字体回退平面字:`, e);
      }
    }),
  );

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
        built = buildText3d(scene, fx, fonts, theme, shell.wallH);
        break;
      case 'decor':
        built = buildDecor(scene, fx, theme);
        break;
      case 'ceiling_sign':
        built = buildCeilingSign(scene, fx, theme, shell.wallH);
        break;
      case 'wall_decor':
        built = buildWallDecor(scene, fx, fonts, shell.wallH);
        break;
      case 'flag':
        built = buildFlag(scene, fx, theme);
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
