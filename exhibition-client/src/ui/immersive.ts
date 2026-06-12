/**
 * 沉浸模式(指针锁定)+ 瞄准准星 UI:
 * - 右下角按钮自愿进入(普通用户不被强制夺走鼠标);ESC 退出(浏览器原生)。
 * - 准星 = 瞄准点(屏幕中心拾取),显示条件:指针锁定 / 手柄已连接 / 跨厅延续。
 * - 跨厅传送是整页跳转,指针锁定必然被浏览器收回,且新页面无用户手势不能自动重锁
 *   (requestPointerLock 需要 user activation)—— 折中:传送前记 sessionStorage,
 *   新厅准星直接延续(视觉不中断),鼠标用户**点一下画面**自动重新锁定;
 *   手柄用户转视角靠摇杆不依赖锁定,完全无感。
 * - 手柄连接即显示准星(配合 interaction/gamepadSelect 的 A 键点选)。
 */

const RESUME_KEY = 'djyy_immersive_resume_v1';
const GAMEPAD_HINT_KEY = 'djyy_gamepad_hint_v1';

let gamepadOn = false;

/** 瞄准模式(中心准星拾取)是否生效:锁定 / 手柄 / 跨厅延续中 */
export function isAimActive(canvas: HTMLCanvasElement): boolean {
  return (
    gamepadOn ||
    document.pointerLockElement === canvas ||
    sessionStorage.getItem(RESUME_KEY) === '1'
  );
}

/** 跨厅传送前调用:锁定中(或延续未消费)则标记,下一厅恢复沉浸 */
export function persistImmersiveAcrossNav(canvas: HTMLCanvasElement): void {
  if (document.pointerLockElement === canvas) sessionStorage.setItem(RESUME_KEY, '1');
}

export function setupImmersiveUi(canvas: HTMLCanvasElement): void {
  if ('ontouchstart' in window) return; // 移动端无指针锁定(摇杆方案见 mobileControls)

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

  // 锁定请求:新 Chrome 返回 Promise,无焦点/被拒会 reject —— 吞掉,留标记等下次手势重试
  const tryLock = () => {
    try {
      const p = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      /* 老浏览器同步抛,忽略 */
    }
  };

  // 沉浸模式按钮
  const btn = document.createElement('button');
  btn.innerHTML = '⛶&nbsp;沉浸漫游';
  btn.title = '隐藏鼠标自由环视(按 ESC 退出)';
  btn.style.cssText = `position:fixed;right:22px;bottom:26px;z-index:30;cursor:pointer;
    background:rgba(20,20,26,.72);color:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.25);
    padding:9px 18px;border-radius:21px;font:13px 'Microsoft YaHei',sans-serif;letter-spacing:.05em;
    backdrop-filter:blur(4px);`;
  btn.addEventListener('click', tryLock);
  document.body.appendChild(btn);

  // 轻提示条(跨厅恢复 / 手柄连接时用,自动消失)
  const hint = document.createElement('div');
  hint.style.cssText = `position:fixed;left:50%;bottom:84px;transform:translateX(-50%);
    background:rgba(20,20,26,.78);color:rgba(255,255,255,.94);padding:8px 20px;border-radius:18px;
    font:13px 'Microsoft YaHei',sans-serif;letter-spacing:.04em;z-index:30;pointer-events:none;
    backdrop-filter:blur(4px);display:none;white-space:nowrap;`;
  document.body.appendChild(hint);
  let hintTimer = 0;
  const showHintMsg = (msg: string, ms = 5000) => {
    hint.textContent = msg;
    hint.style.display = 'block';
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      hint.style.display = 'none';
    }, ms);
  };

  const apply = () => {
    const locked = document.pointerLockElement === canvas;
    const resume = sessionStorage.getItem(RESUME_KEY) === '1';
    crosshair.style.display = locked || gamepadOn || resume ? 'block' : 'none';
    btn.style.display = locked || resume ? 'none' : 'block';
  };

  // 跨厅延续:上一厅锁定中传送过来 → 准星先亮,点一下画面重新锁定
  if (sessionStorage.getItem(RESUME_KEY) === '1') {
    showHintMsg('沉浸漫游延续中 — 点击画面恢复鼠标环视', 6000);
  }
  canvas.addEventListener('pointerdown', () => {
    if (sessionStorage.getItem(RESUME_KEY) === '1') {
      tryLock(); // 成功后 pointerlockchange 里清标记;被拒则标记保留,下次点击再试
    }
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    // 锁定成功 = 延续已消费;主动 ESC 解锁 = 退出沉浸,都清标记
    sessionStorage.removeItem(RESUME_KEY);
    if (!locked) hint.style.display = 'none';
    apply();
  });

  // 手柄连接即进入瞄准模式(准星 + A 键点选,见 gamepadSelect);断开恢复
  window.addEventListener('gamepadconnected', () => {
    gamepadOn = true;
    apply();
    if (sessionStorage.getItem(GAMEPAD_HINT_KEY) !== '1') {
      sessionStorage.setItem(GAMEPAD_HINT_KEY, '1');
      showHintMsg('🎮 手柄已连接:左摇杆移动 · 右摇杆视角 · A 键查看展品 / B 键关闭', 8000);
    }
  });
  window.addEventListener('gamepaddisconnected', () => {
    gamepadOn = !!Array.from(navigator.getGamepads?.() ?? []).some((g) => g && g.connected);
    apply();
  });

  apply();
}
