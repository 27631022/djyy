import { Color3, MeshBuilder, Texture, type Scene } from '@babylonjs/core';
import type { Fixture, VideoWallContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { placeholderTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/** 视频展墙:深色窄边框 + 屏幕(海报/占位,微自发光读作亮屏);点击在浮层里播放 */
export function buildVideoWall(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as VideoWallContent;
  const w = Math.max(fx.w, 2);
  const h = Math.min(w * (9 / 16), 2.6);
  const centerY = 1.1 + h / 2;

  const bezel = MeshBuilder.CreateBox(
    `video-bezel:${fx.id}`,
    { width: w + 0.14, height: h + 0.14, depth: 0.09 },
    scene,
  );
  bezel.position.set(0, centerY, 0);
  bezel.material = pbr(scene, `video-bezel-mat:${fx.id}`, {
    color: Color3.FromHexString('#1B1B1E'),
    metallic: 0.5,
    roughness: 0.4,
  });
  bezel.parent = root;

  const screen = MeshBuilder.CreatePlane(
    `video-screen:${fx.id}`,
    { width: w, height: h },
    scene,
  );
  screen.position.set(0, centerY, -0.052);
  const sMat = pbr(scene, `video-screen-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.6,
  });
  const tex = c.poster
    ? new Texture(c.poster, scene)
    : placeholderTexture(scene, `video-ph:${fx.id}`, {
        title: fx.label ?? '视频展墙',
        subtitle: c.videoUrl ? '点击播放' : '视频待上传',
        icon: '▶',
        accent: theme.accent.toHexString(),
        dark: true,
        ratio: w / h,
      });
  sMat.albedoTexture = tex;
  sMat.emissiveColor = new Color3(0.32, 0.32, 0.34); // 亮屏感
  sMat.emissiveTexture = tex;
  screen.material = sMat;
  screen.parent = root;

  const pickables = [bezel, screen];
  markPickable(pickables, fx);
  return { pickables, spotTargets: [bezel] };
}
