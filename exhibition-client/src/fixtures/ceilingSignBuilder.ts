import { Color3, MeshBuilder, type Scene } from '@babylonjs/core';
import type { CeilingSignContent, Fixture } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { canvasTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/**
 * 顶端吊牌:两根吊杆从吊顶垂下 + 双面文字牌(两块单面板背靠背,防镜像)。
 * 分区指引用;w=牌宽。可点击(弹详情显示名称)。
 */
export function buildCeilingSign(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
  wallH: number,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const text = ((fx.source.content ?? {}) as CeilingSignContent).text || fx.label || '展区';
  const w = Math.max(fx.w, 1.2);
  const signH = 0.5;
  // 牌中心高:吊顶下 ~1.1m,但不低于 2.45(头顶净空)
  const signY = Math.max(2.45, Math.min(wallH - 1.05, 3.2));
  const rodTop = wallH;
  const rodH = rodTop - (signY + signH / 2);

  const rodMat = pbr(scene, `csign-rod:${fx.id}`, {
    color: Color3.FromHexString('#4A4F57'),
    metallic: 0.75,
    roughness: 0.35,
  });
  for (const sx of [-w / 2 + 0.18, w / 2 - 0.18]) {
    const rod = MeshBuilder.CreateCylinder(
      `csign-rodm:${fx.id}:${sx}`,
      { diameter: 0.03, height: Math.max(rodH, 0.1), tessellation: 8 },
      scene,
    );
    rod.position.set(sx, signY + signH / 2 + Math.max(rodH, 0.1) / 2, 0);
    rod.material = rodMat;
    rod.parent = root;
  }

  // 牌身(薄盒,点缀色描边感:深色板 + 发光文字面)
  const board = MeshBuilder.CreateBox(
    `csign-board:${fx.id}`,
    { width: w, height: signH, depth: 0.06 },
    scene,
  );
  board.position.y = signY;
  board.material = pbr(scene, `csign-board-mat:${fx.id}`, {
    color: theme.accent.scale(0.85),
    roughness: 0.5,
    metallic: 0.2,
  });
  board.parent = root;

  // 双面文字(单面板 ×2 背靠背;DOUBLESIDE 背面文字会镜像)
  const texMat = pbr(scene, `csign-text-mat:${fx.id}`, { color: Color3.White(), roughness: 0.7 });
  texMat.albedoTexture = canvasTexture(scene, `csign-tex:${fx.id}`, 768, 192, (ctx, tw, th) => {
    ctx.fillStyle = theme.accent.toHexString();
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(th * 0.52)}px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tw / 2, th / 2 + 4);
  });
  texMat.emissiveColor = new Color3(0.22, 0.22, 0.22);
  texMat.emissiveTexture = texMat.albedoTexture;
  const mkFace = (flip: boolean) => {
    const p = MeshBuilder.CreatePlane(
      `csign-face:${fx.id}:${flip ? 'b' : 'f'}`,
      { width: w - 0.06, height: signH - 0.06 },
      scene,
    );
    p.position.set(0, signY, flip ? 0.034 : -0.034);
    if (flip) p.rotation.y = Math.PI;
    p.material = texMat;
    p.parent = root;
    return p;
  };
  const f1 = mkFace(false);
  const f2 = mkFace(true);

  const pickables = [board, f1, f2];
  markPickable(pickables, fx);
  return { pickables };
}
