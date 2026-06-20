import { Color3, MeshBuilder, Texture, type Scene } from '@babylonjs/core';
import type { Fixture, VideoWallContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { placeholderTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/** 视频展墙:深色窄边框 + 屏幕(海报/占位,微自发光读作亮屏);点击在浮层里播放。
 *  离地高度 / 相框高度可调(参考图片展柜);doubleSided 时背面同屏(中岛双面)。 */
export function buildVideoWall(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? {}) as VideoWallContent;
  const w = Math.max(fx.w, 2);
  // 相框高:有 frameH 用之(0.5~4m),否则按 16:9 自动;下边缘离地 baseElevM(默认 1.1)
  const h = c.frameH ? Math.min(4, Math.max(0.5, c.frameH)) : Math.min(w * (9 / 16), 2.6);
  const centerY = (c.baseElevM ?? 1.1) + h / 2;

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

  // 屏幕材质(海报/占位,微自发光读作亮屏);正反面共用同一张
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

  // 屏幕(单面板;doubleSided 时背面再来一块,旋转 π,文字/画面不镜像)
  const mkScreen = (flip: boolean) => {
    const s = MeshBuilder.CreatePlane(
      `video-screen:${fx.id}:${flip ? 'b' : 'f'}`,
      { width: w, height: h },
      scene,
    );
    s.position.set(0, centerY, flip ? 0.052 : -0.052);
    if (flip) s.rotation.y = Math.PI;
    s.material = sMat;
    s.parent = root;
    return s;
  };
  const pickables = [bezel, mkScreen(false)];
  if (c.doubleSided) pickables.push(mkScreen(true));
  markPickable(pickables, fx);
  return { pickables, spotTargets: [bezel] };
}
