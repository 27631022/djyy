import { Color3, Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { Fixture, NoticeBoardContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { canvasTexture, wrapCjk } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

/** 党务公开板:背板 + 标题 + 公告纸卡列表 */
export function buildNoticeBoard(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? { items: [] }) as NoticeBoardContent;
  const items = (c.items ?? []).slice(0, 4);
  const w = Math.max(fx.w, 1.8);
  const accentHex = theme.accent.toHexString();

  const board = MeshBuilder.CreateBox(
    `notice-board:${fx.id}`,
    { width: w, height: 2.3, depth: 0.08 },
    scene,
  );
  board.position.set(0, 1.65, 0);
  board.material = pbr(scene, `notice-board-mat:${fx.id}`, {
    color: Color3.FromHexString('#E4E0D8'),
    roughness: 0.9,
  });
  board.parent = root;

  const titleBar = MeshBuilder.CreatePlane(
    `notice-title:${fx.id}`,
    { width: 1.4, height: 0.3 },
    scene,
  );
  titleBar.position.set(0, 2.56, -0.045);
  const titleMat = pbr(scene, `notice-title-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.8,
  });
  titleMat.albedoTexture = canvasTexture(scene, `notice-title-tex:${fx.id}`, 512, 110, (ctx, tw, th) => {
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 60px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fx.label ?? '党务公开', tw / 2, th / 2 + 4);
  });
  titleMat.emissiveColor = new Color3(0.12, 0.12, 0.12);
  titleMat.emissiveTexture = titleMat.albedoTexture;
  titleBar.material = titleMat;
  titleBar.parent = root;

  const pickables: Mesh[] = [board, titleBar];
  const cardW = w - 0.36;
  items.forEach((item, idx) => {
    const card = MeshBuilder.CreatePlane(
      `notice-card:${fx.id}:${idx}`,
      { width: cardW, height: 0.46 },
      scene,
    );
    card.position.set(0, 2.18 - idx * 0.56, -0.05);
    const mat = pbr(scene, `notice-card-mat:${fx.id}:${idx}`, {
      color: Color3.White(),
      roughness: 0.8,
    });
    mat.albedoTexture = canvasTexture(
      scene,
      `notice-card-tex:${fx.id}:${idx}`,
      640,
      Math.round((640 * 0.46) / cardW),
      (ctx, tw, th) => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tw, th);
        ctx.fillStyle = accentHex;
        ctx.fillRect(0, 0, 10, th);
        ctx.fillStyle = '#2c2c32';
        ctx.font = `bold ${Math.round(th * 0.34)}px 'Microsoft YaHei', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const line = wrapCjk(ctx, item.title, tw - 200, 1)[0] ?? item.title;
        ctx.fillText(line, 32, th / 2);
        if (item.date) {
          ctx.fillStyle = '#9a9aa2';
          ctx.font = `${Math.round(th * 0.26)}px 'Microsoft YaHei', sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText(item.date, tw - 24, th / 2);
        }
      },
    );
    card.material = mat;
    card.parent = root;
    pickables.push(card);
  });

  markPickable(pickables, fx);
  return { pickables, spotTargets: [board] };
}
