import { Color3, Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { Fixture, HonorWallContent } from '../types';
import type { ThemeParams } from '../theme/presets';
import { pbr } from '../scene/materialFactory';
import { canvasTexture, wrapCjk } from './placeholder';
import { fixtureRoot, markPickable } from './fixtureUtils';
import type { BuiltFixture } from './imageCaseBuilder';

const LEVEL_COLORS: Record<string, string> = {
  国家级: '#C9A227', // 金
  省部级: '#9AA2AC', // 银
  行业级: '#B07A4A', // 铜
};

/** 荣誉墙:背板 + 标题条 + 荣誉证书卡阵列(canvas 卡片,金/银/铜按级别) */
export function buildHonorWall(
  scene: Scene,
  fx: Fixture,
  theme: ThemeParams,
): BuiltFixture {
  const root = fixtureRoot(scene, fx);
  const c = (fx.source.content ?? { items: [] }) as HonorWallContent;
  const items = (c.items ?? []).slice(0, 8);
  const w = Math.max(fx.w, 2.4);

  // 背板
  const board = MeshBuilder.CreateBox(
    `honor-board:${fx.id}`,
    { width: w, height: 2.6, depth: 0.08 },
    scene,
  );
  board.position.set(0, 1.75, 0);
  board.material = pbr(scene, `honor-board-mat:${fx.id}`, {
    color: Color3.FromHexString('#EBE7E0'),
    roughness: 0.85,
  });
  board.parent = root;

  // 标题条
  const titleBar = MeshBuilder.CreatePlane(
    `honor-title:${fx.id}`,
    { width: 1.6, height: 0.34 },
    scene,
  );
  titleBar.position.set(0, 2.78, -0.045);
  const titleMat = pbr(scene, `honor-title-mat:${fx.id}`, {
    color: Color3.White(),
    roughness: 0.8,
  });
  const accentHex = theme.accent.toHexString();
  titleMat.albedoTexture = canvasTexture(scene, `honor-title-tex:${fx.id}`, 512, 110, (ctx, tw, th) => {
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 64px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fx.label ?? '荣誉墙', tw / 2, th / 2 + 4);
  });
  titleMat.emissiveColor = new Color3(0.12, 0.12, 0.12);
  titleMat.emissiveTexture = titleMat.albedoTexture;
  titleBar.material = titleMat;
  titleBar.parent = root;

  // 荣誉卡阵列(最多 2 行 × 4 列)
  const pickables: Mesh[] = [board, titleBar];
  if (items.length > 0) {
    const cols = Math.min(items.length, items.length > 4 ? 4 : 3);
    const rows = Math.ceil(items.length / cols);
    const cardW = 0.62;
    const cardH = 0.78;
    const gapX = Math.min((w - 0.4 - cols * cardW) / Math.max(cols - 1, 1), 0.3);
    const startX = -((cols - 1) * (cardW + gapX)) / 2;
    const startY = rows > 1 ? 2.18 : 1.85;

    items.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const card = MeshBuilder.CreatePlane(
        `honor-card:${fx.id}:${idx}`,
        { width: cardW, height: cardH },
        scene,
      );
      card.position.set(startX + col * (cardW + gapX), startY - row * (cardH + 0.18), -0.05);
      const frame = LEVEL_COLORS[item.level ?? ''] ?? '#9AA2AC';
      const mat = pbr(scene, `honor-card-mat:${fx.id}:${idx}`, {
        color: Color3.White(),
        roughness: 0.75,
      });
      mat.albedoTexture = canvasTexture(scene, `honor-card-tex:${fx.id}:${idx}`, 256, 322, (ctx, tw, th) => {
        ctx.fillStyle = '#FDFBF6';
        ctx.fillRect(0, 0, tw, th);
        ctx.strokeStyle = frame;
        ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, tw - 16, th - 16);
        ctx.strokeStyle = 'rgba(0,0,0,.08)';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, tw - 40, th - 40);
        ctx.font = '52px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏅', tw / 2, 86);
        ctx.fillStyle = '#33333a';
        ctx.font = `bold 27px 'Microsoft YaHei', sans-serif`;
        const lines = wrapCjk(ctx, item.title, tw - 60, 2);
        lines.forEach((ln, li) => ctx.fillText(ln, tw / 2, 150 + li * 38));
        ctx.fillStyle = frame;
        ctx.font = `bold 22px 'Microsoft YaHei', sans-serif`;
        const meta = [item.level, item.year ? `${item.year}` : '']
          .filter(Boolean)
          .join(' · ');
        ctx.fillText(meta, tw / 2, th - 36);
      });
      card.material = mat;
      card.parent = root;
      pickables.push(card);
    });
  }

  markPickable(pickables, fx);
  return { pickables, spotTargets: [board] };
}
