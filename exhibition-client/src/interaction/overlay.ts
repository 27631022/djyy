import type {
  Fixture,
  HonorWallContent,
  ImageCaseContent,
  ModelStandContent,
  NoticeBoardContent,
  Text3dContent,
  VideoWallContent,
  WallDecorContent,
} from '../types';
import { wallDecorPanelsOf, wallDecorTemplate, wallDecorTitleOf } from '../fixtures/wallDecorBuilder';

/**
 * HTML 详情浮层(不用 Babylon GUI —— DOM 文字永远清晰)。
 * 点击组件 → 半透明遮罩 + 内容卡;ESC / 点遮罩 / × 关闭。
 * ⚠ VR 画面内不可见(P1 已知限制)。
 */
export class Overlay {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private accent: string;
  onOpenChange?: (open: boolean) => void;

  constructor(accent: string) {
    this.accent = accent;
    this.root = document.createElement('div');
    this.root.style.cssText = `position:fixed;inset:0;display:none;z-index:50;
      background:rgba(12,12,16,.62);backdrop-filter:blur(6px);
      align-items:center;justify-content:center;`;
    this.card = document.createElement('div');
    this.card.style.cssText = `position:relative;max-width:min(860px,92vw);max-height:86vh;overflow:auto;
      background:#fff;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.5);
      padding:0 0 20px;min-width:320px;`;
    this.root.appendChild(this.card);
    document.body.appendChild(this.root);

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.hide();
    });
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.card.innerHTML = '';
    this.onOpenChange?.(false);
  }

  show(fx: Fixture): void {
    document.exitPointerLock?.();
    this.card.innerHTML = '';
    this.card.appendChild(this.header(fx.label ?? this.typeName(fx.type)));
    const body = document.createElement('div');
    body.style.cssText = 'padding:18px 24px 4px;font:15px/1.8 "Microsoft YaHei",sans-serif;color:#333;';
    this.fillBody(body, fx);
    this.card.appendChild(body);
    this.root.style.display = 'flex';
    this.onOpenChange?.(true);
  }

  private header(title: string): HTMLDivElement {
    const h = document.createElement('div');
    h.style.cssText = `display:flex;align-items:center;justify-content:space-between;
      padding:16px 24px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;border-radius:14px 14px 0 0;`;
    const t = document.createElement('div');
    t.style.cssText = `font:bold 19px 'Microsoft YaHei',sans-serif;color:#222;
      border-left:4px solid ${this.accent};padding-left:12px;`;
    t.textContent = title;
    const x = document.createElement('button');
    x.textContent = '×';
    x.style.cssText = `border:none;background:#f3f3f5;width:34px;height:34px;border-radius:50%;
      font-size:20px;cursor:pointer;color:#666;line-height:1;`;
    x.onclick = () => this.hide();
    h.append(t, x);
    return h;
  }

  private typeName(t: Fixture['type']): string {
    const names: Record<string, string> = {
      image_case: '图片展柜',
      video_wall: '视频展墙',
      model_stand: '模型台',
      honor_wall: '荣誉墙',
      notice_board: '党务公开板',
      door: '通道',
      text_3d: '标语',
      wall_decor: '文化墙',
    };
    return names[t] ?? t;
  }

  private fillBody(body: HTMLElement, fx: Fixture): void {
    const c = fx.source.content;
    switch (fx.type) {
      case 'image_case': {
        const ic = (c ?? { images: [] }) as ImageCaseContent;
        const all = [...(ic.images ?? []), ...(ic.backImages ?? [])]; // 正反面素材都列出
        if (!all.length) {
          body.innerHTML = `<p style="color:#999;">该展柜尚未上传图片素材。</p>`;
          break;
        }
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;';
        for (const img of all) {
          if (!img.url) continue;
          const cell = document.createElement('figure');
          cell.style.cssText = 'margin:0;';
          cell.innerHTML = `<img src="${img.url}" style="width:100%;border-radius:8px;display:block;" />` +
            (img.caption ? `<figcaption style="font-size:13px;color:#888;margin-top:6px;">${img.caption}</figcaption>` : '');
          grid.appendChild(cell);
        }
        body.appendChild(grid);
        break;
      }
      case 'video_wall': {
        const vc = (c ?? {}) as VideoWallContent;
        if (vc.videoUrl) {
          const v = document.createElement('video');
          v.src = vc.videoUrl;
          v.controls = true;
          v.autoplay = true;
          v.style.cssText = 'width:100%;border-radius:10px;background:#000;';
          if (vc.poster) v.poster = vc.poster;
          body.appendChild(v);
        } else {
          body.innerHTML = `<p style="color:#999;">该展墙尚未上传视频素材。</p>`;
        }
        break;
      }
      case 'honor_wall': {
        const hc = (c ?? { items: [] }) as HonorWallContent;
        if (!hc.items?.length) {
          body.innerHTML = `<p style="color:#999;">暂无荣誉数据。</p>`;
          break;
        }
        const list = document.createElement('div');
        list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;';
        for (const it of hc.items) {
          const card = document.createElement('div');
          card.style.cssText = `border:1px solid #eee;border-radius:10px;padding:14px 16px;background:#fdfcf9;`;
          card.innerHTML = `<div style="font-weight:bold;color:#333;">🏅 ${it.title}</div>
            <div style="font-size:13px;color:#a08327;margin-top:6px;">${[it.level, it.year].filter(Boolean).join(' · ')}</div>`;
          list.appendChild(card);
        }
        body.appendChild(list);
        break;
      }
      case 'notice_board': {
        const nc = (c ?? { items: [] }) as NoticeBoardContent;
        if (!nc.items?.length) {
          body.innerHTML = `<p style="color:#999;">暂无公开事项。</p>`;
          break;
        }
        for (const it of nc.items) {
          const row = document.createElement('div');
          row.style.cssText = `display:flex;justify-content:space-between;gap:16px;
            padding:12px 4px;border-bottom:1px dashed #e5e5e5;`;
          row.innerHTML = `<div style="border-left:3px solid ${this.accent};padding-left:10px;">${it.title}</div>
            <div style="color:#999;font-size:13px;white-space:nowrap;">${it.date ?? ''}</div>`;
          body.appendChild(row);
        }
        break;
      }
      case 'model_stand': {
        const mc = (c ?? {}) as ModelStandContent;
        const p = document.createElement('p');
        if (mc.intro?.trim()) {
          p.style.cssText = 'white-space:pre-wrap;margin:4px 0 8px;';
          p.textContent = mc.intro.trim();
        } else {
          p.style.color = '#999';
          p.textContent = '该模型台暂无介绍。';
        }
        body.appendChild(p);
        break;
      }
      case 'text_3d': {
        const tc = (c ?? {}) as Text3dContent;
        body.innerHTML = `<p style="font-size:22px;font-weight:bold;color:${this.accent};text-align:center;padding:18px 0;">${tc.text ?? ''}</p>`;
        break;
      }
      case 'wall_decor': {
        const wc = (c ?? {}) as WallDecorContent;
        const tpl = wallDecorTemplate(wc);
        const t = document.createElement('p');
        t.style.cssText = `font-size:21px;font-weight:bold;color:${this.accent};text-align:center;padding:10px 0 14px;margin:0;`;
        t.textContent = wallDecorTitleOf(wc);
        body.appendChild(t);
        if (tpl === 'honor_red') {
          const p = document.createElement('p');
          p.style.cssText = 'color:#999;text-align:center;margin:0 0 8px;';
          p.textContent = `${wc.rows ?? 3} 排 × ${wc.cols ?? 5} 格荣誉相框(后续可接入证书系统数据)`;
          body.appendChild(p);
        } else {
          const list = document.createElement('div');
          list.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding-bottom:8px;';
          for (const name of wallDecorPanelsOf(wc)) {
            const chip = document.createElement('span');
            chip.style.cssText = `border:1px solid ${this.accent}33;background:${this.accent}0d;color:${this.accent};
              border-radius:999px;padding:4px 14px;font-size:13px;`;
            chip.textContent = name;
            list.appendChild(chip);
          }
          body.appendChild(list);
        }
        break;
      }
      default:
        body.innerHTML = `<p style="color:#999;">${this.typeName(fx.type)}</p>`;
    }
  }
}
