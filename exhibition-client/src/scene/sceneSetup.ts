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

  // 色调映射挂在「场景级 image processing」上:没有后处理管线时由材质 shader
  // 内联完成(零额外全屏 pass,UHD630 关键省) —— pipeline 存在时也是同一配置对象。
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 0.9; // 用户反馈「有点亮」,从 1.05 下调

  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.15), scene);
  hemi.intensity = theme.hemiIntensity;
  // groundColor 默认黑 → 朝下的面(吊顶底面/格栅)收不到光,会发黑
  hemi.groundColor = theme.ceiling.scale(0.55);

  // IBL:自托管 1K HDR(运行时预滤波);加载失败只降质不阻塞
  // 路径跟随部署 base(3001 托管在 /exhibition/ 下,不能写死绝对路径)
  const env = new HDRCubeTexture(
    `${import.meta.env.BASE_URL}env/studio.hdr`,
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

export interface PostFx {
  pipeline: DefaultRenderingPipeline | null;
  glow: GlowLayer;
}

/**
 * 后期:GlowLayer(灯带/发光字)始终创建(low 档用 isEnabled 关掉它的 pass);
 * DefaultRenderingPipeline(FXAA/bloom/vignette)仅 withPipeline 时创建 ——
 * low 档完全不要它,场景直出 backbuffer,零全屏后处理。
 */
export function createPostFx(
  scene: Scene,
  camera: Camera,
  theme: ThemeParams,
  withPipeline: boolean,
): PostFx {
  let pipeline: DefaultRenderingPipeline | null = null;
  if (withPipeline) {
    pipeline = new DefaultRenderingPipeline('post', true, scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true; // 复用 scene.imageProcessingConfiguration
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 0.85;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.85;
    pipeline.bloomWeight = 0.18;
    pipeline.bloomKernel = 48;
  }

  const glow = new GlowLayer('glow', scene);
  glow.intensity = theme.glowIntensity;
  return { pipeline, glow };
}
