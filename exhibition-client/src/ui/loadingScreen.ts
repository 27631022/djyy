/** 品牌化加载页:厅名 + 进度条;出错时给可读提示 */
export class LoadingScreen {
  private root: HTMLDivElement;
  private title: HTMLDivElement;
  private bar: HTMLDivElement;
  private label: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText = `position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;
      align-items:center;justify-content:center;background:#17171b;color:#fff;
      font-family:'Microsoft YaHei',sans-serif;transition:opacity .6s;`;
    this.title = document.createElement('div');
    this.title.style.cssText = 'font-size:30px;font-weight:bold;letter-spacing:.18em;margin-bottom:30px;';
    this.title.textContent = '虚拟展厅';
    const track = document.createElement('div');
    track.style.cssText = 'width:min(420px,70vw);height:4px;background:rgba(255,255,255,.14);border-radius:2px;overflow:hidden;';
    this.bar = document.createElement('div');
    this.bar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#C8001E,#F5A623);transition:width .35s;';
    track.appendChild(this.bar);
    this.label = document.createElement('div');
    this.label.style.cssText = 'margin-top:16px;font-size:13px;color:rgba(255,255,255,.55);letter-spacing:.1em;';
    this.label.textContent = '正在加载…';
    this.root.append(this.title, track, this.label);
    document.body.appendChild(this.root);
  }

  setTitle(name: string): void {
    this.title.textContent = name;
  }

  setProgress(pct: number, label: string): void {
    this.bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    this.label.textContent = label;
  }

  hide(): void {
    this.setProgress(100, '完成');
    this.root.style.opacity = '0';
    setTimeout(() => this.root.remove(), 650);
  }

  error(msg: string): void {
    this.bar.style.background = '#888';
    this.label.style.color = '#ff8a8a';
    this.label.style.letterSpacing = '0';
    this.label.style.maxWidth = '70vw';
    this.label.style.lineHeight = '1.8';
    this.label.textContent = msg;
  }
}

/** 操作提示(左下角,几秒后淡出) */
export function showHint(): void {
  const isTouch = 'ontouchstart' in window;
  const hint = document.createElement('div');
  hint.style.cssText = `position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:20;
    background:rgba(20,20,26,.72);color:rgba(255,255,255,.92);padding:10px 22px;border-radius:22px;
    font:13px 'Microsoft YaHei',sans-serif;letter-spacing:.05em;backdrop-filter:blur(4px);
    transition:opacity 1s;white-space:nowrap;`;
  hint.textContent = isTouch
    ? '左下摇杆移动 · 拖动屏幕转视角 · 点击展品看详情'
    : 'WASD 移动 · Q/E 或拖动转视角 · 点击展品看详情';
  document.body.appendChild(hint);
  setTimeout(() => {
    hint.style.opacity = '0';
    setTimeout(() => hint.remove(), 1100);
  }, 6500);
}
