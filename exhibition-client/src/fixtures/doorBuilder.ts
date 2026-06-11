import { Color3, MeshBuilder, type Scene } from '@babylonjs/core';
import type { DoorContent, Fixture } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { canvasTexture } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/** 门/通道:门套(双立柱+横梁,点缀色金属)+ 门头标识牌;不挡路(墙留洞) */
export function buildDoor(scene: Scene, fx: Fixture, theme: ThemeParams): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const w = Math.max(fx.w, 1.2);
  const jambMat = pbr(scene, `door-mat:${fx.id}`, {
    color: theme.accent.scale(0.78),
    metallic: 0.4,
    roughness: 0.45,
  });

  const mkJamb = (x: number) => {
    const j = MeshBuilder.CreateBox(
      `door-jamb:${fx.id}:${x}`,
      { width: 0.14, height: 2.5, depth: 0.22 },
      scene,
    );
    j.position.set(x, 1.25, 0);
    j.material = jambMat;
    j.parent = root;
    return j;
  };
  const j1 = mkJamb(-(w / 2 + 0.07));
  const j2 = mkJamb(w / 2 + 0.07);

  const lintel = MeshBuilder.CreateBox(
    `door-lintel:${fx.id}`,
    { width: w + 0.42, height: 0.16, depth: 0.22 },
    scene,
  );
  lintel.position.set(0, 2.58, 0);
  lintel.material = jambMat;
  lintel.parent = root;

  // 门头标识牌:两块单面板背靠背(DOUBLESIDE 从背面看文字会镜像)
  // 设了目标展厅 → 显示「→ 厅名」,点击传送(拦截在 main.ts onPick)
  const door = (fx.source.content ?? {}) as DoorContent;
  const label = door.targetHallId
    ? `→ ${door.targetName || '另一个展厅'}`
    : (fx.label ?? '通道');
  const signMat = pbr(scene, `door-sign-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.7,
  });
  signMat.albedoTexture = canvasTexture(scene, `door-sign-tex:${fx.id}`, 512, 124, (ctx, tw, th) => {
    ctx.fillStyle = theme.accent.toHexString();
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 62px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tw / 2, th / 2 + 4);
  });
  signMat.emissiveColor = new Color3(0.14, 0.14, 0.14);
  signMat.emissiveTexture = signMat.albedoTexture;
  const mkSign = (flip: boolean) => {
    const s = MeshBuilder.CreatePlane(
      `door-sign:${fx.id}:${flip ? 'b' : 'f'}`,
      { width: 1.5, height: 0.36 },
      scene,
    );
    s.position.set(0, 2.88, flip ? 0.012 : -0.012);
    if (flip) s.rotation.y = Math.PI;
    s.material = signMat;
    s.parent = root;
    return s;
  };
  const signF = mkSign(false);
  const signB = mkSign(true);

  const pickables = [j1, j2, lintel, signF, signB];
  markPickable(pickables, fx);
  return { pickables };
}
