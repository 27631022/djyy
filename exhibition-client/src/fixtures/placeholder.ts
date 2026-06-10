import { DynamicTexture, type Scene } from '@babylonjs/core';

/**
 * 「精致占位」画布纹理 —— 未上传素材的组件也要好看:
 * 渐变底 + 主题色顶条 + 内描边 + 图标 + 标题/副标题。
 */
export interface PlaceholderOpts {
  title: string;
  subtitle?: string;
  icon?: string; // emoji
  accent: string; // hex,如 #C8001E
  dark?: boolean;
  ratio?: number; // 宽/高,默认 1.4
}

export function placeholderTexture(
  scene: Scene,
  name: string,
  o: PlaceholderOpts,
): DynamicTexture {
  const W = 768;
  const H = Math.round(W / (o.ratio ?? 1.4));
  const tex = new DynamicTexture(name, { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (o.dark) {
    g.addColorStop(0, '#24272d');
    g.addColorStop(1, '#17191d');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#efede8');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = o.accent;
  ctx.fillRect(0, 0, W, 10);

  ctx.strokeStyle = o.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  ctx.textAlign = 'center';
  if (o.icon) {
    ctx.font = `${Math.round(H * 0.28)}px serif`;
    ctx.globalAlpha = 0.92;
    ctx.fillText(o.icon, W / 2, H * 0.46);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = o.dark ? '#f0f0f2' : '#28282c';
  ctx.font = `bold ${Math.round(H * 0.09)}px 'Microsoft YaHei', sans-serif`;
  ctx.fillText(o.title, W / 2, H * 0.66);
  if (o.subtitle) {
    ctx.fillStyle = o.dark ? '#9aa0a8' : '#8d8d93';
    ctx.font = `${Math.round(H * 0.052)}px 'Microsoft YaHei', sans-serif`;
    ctx.fillText(o.subtitle, W / 2, H * 0.78);
  }
  tex.update();
  return tex;
}

/** 自定义画布纹理(荣誉卡/公告卡等) */
export function canvasTexture(
  scene: Scene,
  name: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx, w, h);
  tex.update();
  return tex;
}

/** CJK 文本按宽度折行(无空格语言,逐字测量) */
export function wrapCjk(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length === maxLines && line) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}
