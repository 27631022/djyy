import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  GlowLayer,
  HDRCubeTexture,
  HemisphericLight,
  ImageProcessingConfiguration,
  Scene,
  Vector3,
  type Camera,
  type Engine,
} from '@babylonjs/core';
import type { ThemeParams } from '../theme/presets';

/** Scene + IBL 环境(PBR 质感根基)+ 基础环境光 + 碰撞/重力 */
export function createScene(engine: Engine, theme: ThemeParams): Scene {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromColor3(theme.clearColor, 1);
  scene.ambientColor = new Color3(0.25, 0.25, 0.25);
  scene.collisionsEnabled = true;
  scene.gravity = new Vector3(0, -0.45, 0);

  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.15), scene);
  hemi.intensity = theme.hemiIntensity;
  // groundColor 默认黑 → 朝下的面(吊顶底面/格栅)收不到光,会发黑
  hemi.groundColor = theme.ceiling.scale(0.55);

  // IBL:自托管 1K HDR(运行时预滤波);加载失败只降质不阻塞
  const env = new HDRCubeTexture(
    '/env/studio.hdr',
    scene,
    128,
    false,
    true,
    false,
    true,
    undefined,
    () => console.warn('[展厅] 环境贴图加载失败,PBR 反射降级'),
  );
  scene.environmentTexture = env;
  scene.environmentIntensity = theme.envIntensity;
  return scene;
}

/** 后期管线:FXAA + ACES 色调映射 + 轻 bloom + 轻 vignette;GlowLayer 给灯带/发光字 */
export function createPostFx(
  scene: Scene,
  camera: Camera,
  theme: ThemeParams,
): { glow: GlowLayer } {
  const pp = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pp.fxaaEnabled = true;
  pp.imageProcessingEnabled = true;
  pp.imageProcessing.toneMappingEnabled = true;
  pp.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pp.imageProcessing.exposure = 1.05;
  pp.imageProcessing.vignetteEnabled = true;
  pp.imageProcessing.vignetteWeight = 0.85;
  pp.bloomEnabled = true;
  pp.bloomThreshold = 0.85;
  pp.bloomWeight = 0.18;
  pp.bloomKernel = 48;

  const glow = new GlowLayer('glow', scene);
  glow.intensity = theme.glowIntensity;
  return { glow };
}
