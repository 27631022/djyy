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

  // ⚠ 门套必须「包住」墙体切口(向洞内收 3cm):立柱内侧面若与墙切口断面共面
  // (都在 x=±w/2),会 z-fighting 闪白(门框内边缘红白打架,实测踩过)。
  // 内收后切口断面藏进门套体内(门套深 0.22 > 墙厚 0.2,前后各包 1cm),彻底不可见。
  const INSET = 0.03;
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
  const j1 = mkJamb(-(w / 2 + 0.07 - INSET));
  const j2 = mkJamb(w / 2 + 0.07 - INSET);

  // 横梁底面下移到 2.47(墙体过梁底面在 2.50):同理避免两个底面共面闪烁,
  // 墙体水平切口线(2.50)藏进红梁体内
  const lintel = MeshBuilder.CreateBox(
    `door-lintel:${fx.id}`,
    { width: w + 0.42, height: 0.16, depth: 0.22 },
    scene,
  );
  lintel.position.set(0, 2.55, 0);
  lintel.material = jambMat;
  lintel.parent = root;

  // 门头标识牌:两块单面板背靠背,**正反面各自一套材质/文字**(可显示不同的字,如
  // 正面「→ 车辆展厅」、背面「→ 序厅」)。DOUBLESIDE 会镜像文字,故单面板分开做。
  // 设了目标展厅且未自定义文字时,回退「→ 厅名」;点击传送(拦截在 main.ts onPick)。
  const door = (fx.source.content ?? {}) as DoorContent;
  const fallback = door.targetHallId
    ? `→ ${door.targetName || '另一个展厅'}`
    : (fx.label ?? '通道');
  const frontText = door.frontText?.trim() || fallback;
  const backText = door.backText?.trim() || frontText;
  const mkSignMat = (text: string, key: string) => {
    const mat = pbr(scene, `door-sign-mat:${fx.id}:${key}`, {
      color: Color3.White(),
      roughness: 0.7,
    });
    mat.albedoTexture = canvasTexture(scene, `door-sign-tex:${fx.id}:${key}`, 512, 124, (ctx, tw, th) => {
      ctx.fillStyle = theme.accent.toHexString();
      ctx.fillRect(0, 0, tw, th);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 62px 'Microsoft YaHei', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tw / 2, th / 2 + 4);
    });
    mat.emissiveColor = new Color3(0.14, 0.14, 0.14);
    mat.emissiveTexture = mat.albedoTexture;
    return mat;
  };
  // ⚠ 牌挂「门洞内上沿」(2.26m,真实出口牌位置),不能挂门框上方(原 2.88):
  // 门放在实体墙上时,墙体过梁(净高 2.5 以上补墙)会把 2.88 的牌整个吞进墙里看不见。
  const mkSign = (flip: boolean, mat: ReturnType<typeof mkSignMat>) => {
    const s = MeshBuilder.CreatePlane(
      `door-sign:${fx.id}:${flip ? 'b' : 'f'}`,
      { width: 1.5, height: 0.36 },
      scene,
    );
    s.position.set(0, 2.26, flip ? 0.012 : -0.012);
    if (flip) s.rotation.y = Math.PI;
    s.material = mat;
    s.parent = root;
    return s;
  };
  const signF = mkSign(false, mkSignMat(frontText, 'f'));
  const signB = mkSign(true, mkSignMat(backText, 'b'));

  const pickables = [j1, j2, lintel, signF, signB];
  markPickable(pickables, fx);
  return { pickables };
}
