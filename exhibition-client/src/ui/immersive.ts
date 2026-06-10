/**
 * 沉浸模式(指针锁定)UI:
 * - 右下角按钮自愿进入(普通用户不被强制夺走鼠标);
 * - 锁定时屏幕中心显示准星(瞄准点 = 拾取点),按钮隐藏;
 * - ESC 退出(浏览器原生),退出后按钮回来。
 */
export function setupImmersiveUi(canvas: HTMLCanvasElement): void {
  if ('ontouchstart' in window) return; // 移动端无指针锁定

  // 准星:中心白点 + 细环(黑描边阴影保证亮暗背景都可见)
  const crosshair = document.createElement('div');
  crosshair.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(255,255,255,.9);
    box-shadow:0 0 2px rgba(0,0,0,.8), inset 0 0 2px rgba(0,0,0,.8);
    pointer-events:none;z-index:25;display:none;`;
  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 2px rgba(0,0,0,.9);`;
  crosshair.appendChild(dot);
  document.body.appendChild(crosshair);

  // 沉浸模式按钮
  const btn = document.createElement('button');
  btn.innerHTML = '⛶&nbsp;沉浸漫游';
  btn.title = '隐藏鼠标自由环视(按 ESC 退出)';
  btn.style.cssText = `position:fixed;right:22px;bottom:26px;z-index:30;cursor:pointer;
    background:rgba(20,20,26,.72);color:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.25);
    padding:9px 18px;border-radius:21px;font:13px 'Microsoft YaHei',sans-serif;letter-spacing:.05em;
    backdrop-filter:blur(4px);`;
  btn.addEventListener('click', () => {
    canvas.requestPointerLock?.();
  });
  document.body.appendChild(btn);

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    crosshair.style.display = locked ? 'block' : 'none';
    btn.style.display = locked ? 'none' : 'block';
  });
}
