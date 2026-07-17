import sharp from 'sharp';

/**
 * 「弹出人物」抠像:把纯色摄影棚背景的头像抠成透明底人物图(webp),
 * 供前端在通讯录等处做"悬浮时人物伸出背景圆圈"的立体效果。
 *
 * 算法(在真实头像库/AI 照片素材上离线调参定型,2026-07-16):
 *   1. 顶边 + 左右边上部取样估亮部背景色;按全边框纯度分两种模式(种子都只下顶部+上侧,
 *      底部边缘是人物衣着不能当背景)——
 *      A=平面纯色底(卡通头像):容差放宽到 t2 + **梯度屏障**(泛洪不进邻域梯度 >6 的像素)。
 *        深色衣服与深灰摄影棚底真同色(实测色距 8~15 < t1),色键无解;衣服轮廓的软 AA 边
 *        "每步都平滑"但边界中点像素的邻域梯度远高于平面底噪声,屏障能在软边上竖墙。
 *        另加三道几何防线:泛洪**禁止向上扩张**(防从原画自带的底部背景横带向上爬进衣服)、
 *        **底部 4% 保护带**(横爬禁入)+ 竖向释放(带内"正上方是背景"的近背景像素放行,
 *        真背景纵向流到底,衣服底部阴影带因上方是人物而受保护)、
 *        背景近消色(max-min<12)时**禁走 B**(灰底的明暗线=消色轴,灰/黑衣残差≈0 会全军覆没);
 *      B=同色相渐变底(AI 照片红底渐晕,顶部亮红→底角近黑):背景 = 到「明暗线」(原点→亮参考色)
 *        残差小 + 与邻居平滑连通,深色背景靠连通流下去。
 *      顶部都不贴合明暗线的(户外复杂背景)判不适用
 *   2. 泛洪 = 核心背景(A 靠梯度屏障、B 靠邻居平滑挡住人物/背景交界的渗入)
 *   3. 受限增长:核心边缘向内最多 GROW_STEPS px 吞掉宽容差过渡带(抗锯齿混色),
 *      不会像单一宽容差那样顺发丝无限渗入
 *   4. 人物掩膜闭运算(倒角距离变换 膨胀→腐蚀,圆形核):填回"发顶高光带/细咬边" ——
 *      这些区域与背景几乎同色(实测色距 2~6),色键必丢,只能几何修补;填回后显示原像素,
 *      恰好就是高光该有的颜色(B 模式半径加大:红底轮廓光啃出的发梢锯齿更宽)
 *   5. 孤岛清除(离体浮块丢弃)→ 人物向内收 1px 吃贴边杂色 → 内部孔洞回填(被人物围住的
 *      透明区还原原图像素:抠像只剥外部背景,不在人物内部开洞)→ 去雾边(B 模式,外缘带按
 *      背景相似度衰减 alpha)→ 轻模糊羽化 → RGB+alpha 合成透明 webp(非方形透明补边归方)
 *
 * 返回 null = 图片不适合抠像(复杂背景/背景占比异常/顶角未连通),调用方回退无弹出效果。
 */

const WORK_SIDE = 640; // 工作尺寸上限(展示仅 48~96px,640 质量足够且毫秒级)
const BORDER_SOLID_MIN = 0.9; // 取样边框内「近背景色」占比下限,低于视为复杂背景
const BG_MIN_RATIO = 0.12; // 抠除背景占比合理区间(过小=没抠动,过大=连人一起抠)
const BG_MAX_RATIO = 0.9;
const GROW_STEPS = 8; // 受限增长步数 = 过渡带最大侵蚀深度(px)
const CLOSE_R = 11; // 闭运算半径:填补 ≤2r 宽的同背景色内部区域
const EPS_SMOOTH = 13; // B 模式(渐变底)泛洪的邻居平滑阈(每通道;深阴影区放宽到 20)
const GRAD_BARRIER = 6; // A 模式梯度屏障:泛洪不进邻域梯度(每通道最大差)超过它的像素
const SAT_MIN_FOR_B = 12; // 背景饱和度(max-min)低于它禁走 B 模式(消色轴上灰/黑衣残差≈0)
const BOTTOM_GUARD = 0.04; // A 模式底部保护带高度占比(全宽;横爬禁入,竖向释放放行真背景)

/**
 * 倒角距离变换(正交 3 / 对角 4,准欧氏;经典两遍扫描 O(n))—— 圆形结构元。
 * ⚠ 不能用切比雪夫(棋盘距离):它等价方形核,闭运算会把发丝间的小孔洞/边缘
 *   整形成横平竖直的"小方块"(实测踩坑,通讯录用户可见)。阈值按 ×3 换算。
 */
function chamferDT(mask: Uint8Array, w: number, h: number): Int32Array {
  const INF = 1 << 29;
  const d = new Int32Array(w * h).fill(INF);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (mask[p]) {
        d[p] = 0;
        continue;
      }
      let m = INF;
      if (x > 0) m = Math.min(m, d[p - 1] + 3);
      if (y > 0) {
        m = Math.min(m, d[p - w] + 3);
        if (x > 0) m = Math.min(m, d[p - w - 1] + 4);
        if (x < w - 1) m = Math.min(m, d[p - w + 1] + 4);
      }
      d[p] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      let m = d[p];
      if (x < w - 1) m = Math.min(m, d[p + 1] + 3);
      if (y < h - 1) {
        m = Math.min(m, d[p + w] + 3);
        if (x < w - 1) m = Math.min(m, d[p + w + 1] + 4);
        if (x > 0) m = Math.min(m, d[p + w - 1] + 4);
      }
      d[p] = m;
    }
  }
  return d;
}

/**
 * 非方形抠像 → 透明补边成正方形(底部对齐、水平居中)—— 前端按 aspect-square 显示,不归方会裁头顶。
 * ⚠ extend 与 joinChannel 在 sharp 固定管线序里会错配,非方形须先物化中间 PNG 再第二段补边。
 */
async function squareWebp(pipeline: sharp.Sharp, w: number, h: number): Promise<Buffer> {
  if (w === h) return pipeline.webp({ quality: 90 }).toBuffer();
  const side = Math.max(w, h);
  const png = await pipeline.png().toBuffer();
  return sharp(png)
    .extend({
      top: side - h,
      left: Math.floor((side - w) / 2),
      right: Math.ceil((side - w) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90 })
    .toBuffer();
}

export async function extractPopCutout(src: Buffer): Promise<Buffer | null> {
  const meta = await sharp(src).metadata();
  // ⚠ metadata().width/height 是 EXIF 旋转前的存储尺寸;.rotate() 会按 EXIF 转正(方向 5-8 交换宽高),
  //   必须用旋后尺寸算 w/h,否则 fit:'fill' 会把人物拉伸变形
  const swap = (meta.orientation ?? 1) >= 5;
  const baseW = meta.autoOrient?.width ?? (swap ? meta.height : meta.width);
  const baseH = meta.autoOrient?.height ?? (swap ? meta.width : meta.height);
  if (!baseW || !baseH) return null;
  const scale = Math.min(1, WORK_SIDE / Math.max(baseW, baseH));
  const w = Math.max(8, Math.round(baseW * scale));
  const h = Math.max(8, Math.round(baseH * scale));
  // 闭运算半径随工作尺寸等比(CLOSE_R 按 640 调参;小图用定值会让膨胀吞满全帧)
  let closeR = Math.max(2, Math.round((CLOSE_R * Math.max(w, h)) / WORK_SIDE));
  const { data } = await sharp(src)
    .rotate()
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 源图已是透明抠像(顶角透明,如头像编辑器透明底产物)→ 原样缩放转 webp
  const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  if (meta.hasAlpha && alphaAt(1, 1) < 16 && alphaAt(w - 2, 1) < 16) {
    return squareWebp(sharp(src).rotate().resize(w, h, { fit: 'fill' }), w, h);
  }

  // 1) 亮部背景参考:顶边 + 左右边上部 60%(人物从底边进入画面,底边中段是身体不是背景)
  const topSamples: number[] = [];
  for (let x = 0; x < w; x++) topSamples.push(x);
  const sideH = Math.floor(h * 0.6);
  for (let y = 1; y < sideH; y++) topSamples.push(y * w, y * w + w - 1);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const p of topSamples) {
    sr += data[p * 4];
    sg += data[p * 4 + 1];
    sb += data[p * 4 + 2];
  }
  const n = topSamples.length;
  const br = sr / n;
  const bgc = sg / n;
  const bb = sb / n;
  const dist2 = (p: number) => {
    const dr = data[p * 4] - br;
    const dg = data[p * 4 + 1] - bgc;
    const db = data[p * 4 + 2] - bb;
    return dr * dr + dg * dg + db * db;
  };
  let sd2 = 0;
  for (const p of topSamples) sd2 += dist2(p);
  const rms = Math.sqrt(sd2 / n);
  const t1 = Math.max(12, Math.min(30, rms * 3.5 + 8));
  const t2 = Math.max(t1 * 2, t1 + 14);
  const t1sq = t1 * t1;
  const t2sq = t2 * t2;

  // 全边框纯度(含左右边下部与底边两端 20%;底边中段不取)决定模式:
  // 摄影棚照片的渐晕集中在下部,只看顶部会把渐变底误判成平面底
  const borderAll = [...topSamples];
  const bottomX = Math.floor(w * 0.2);
  for (let x = 0; x < bottomX; x++) borderAll.push((h - 1) * w + x, (h - 1) * w + (w - 1 - x));
  for (let y = sideH; y < h - 1; y++) borderAll.push(y * w, y * w + w - 1);
  let hit = 0;
  for (const p of borderAll) if (dist2(p) <= t1sq) hit++;
  const flatSolid = hit / borderAll.length >= BORDER_SOLID_MIN;

  // 2) 判背景归属的谓词:
  //    A 模式(平面纯色底,卡通头像)= 与背景均色的绝对色距;
  //    B 模式(同色相渐变底,AI 照片红底渐晕)= 到「明暗线」(原点→亮参考色)的残差 + 邻居平滑。
  //    B 的种子只下在顶部+上侧(半身照那里必然是背景;底部边缘是人物衣着,不能当背景),
  //    底部深色背景靠贴线+平滑连通从上侧流下去覆盖;人物/背景交界的边缘挡住渗入。
  let near: (p: number) => boolean;
  let nearGrow: (p: number) => boolean;
  let needSmooth = false;
  let bgLikeness: ((p: number) => number) | null = null;
  // 背景近消色(灰底)时禁走 B:B 的明暗线过原点,灰/黑衣服残差≈0 会被整件吃掉
  const bgSat = Math.max(br, bgc, bb) - Math.min(br, bgc, bb);
  const modeA = flatSolid || bgSat < SAT_MIN_FOR_B;
  if (modeA) {
    nearGrow = (p) => dist2(p) <= t2sq;
    // 梯度屏障:深色衣服与深灰底真同色(色距<t1)时色键无解,但衣服轮廓的软 AA 边上
    // 像素的邻域梯度远高于平面底噪声 → 泛洪容差放宽到 t2(覆盖渐晕角)、不进高梯度像素
    const grad = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        for (const q of [x < w - 1 ? p + 1 : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0) continue;
          const d = Math.min(
            255,
            Math.max(
              Math.abs(data[p * 4] - data[q * 4]),
              Math.abs(data[p * 4 + 1] - data[q * 4 + 1]),
              Math.abs(data[p * 4 + 2] - data[q * 4 + 2]),
            ),
          );
          if (d > grad[p]) grad[p] = d;
          if (d > grad[q]) grad[q] = d;
        }
      }
    }
    near = (p) => dist2(p) <= t2sq && grad[p] <= GRAD_BARRIER;
  } else {
    const norm = Math.sqrt(br * br + bgc * bgc + bb * bb) || 1;
    const cr = br / norm;
    const cg = bgc / norm;
    const cb = bb / norm;
    const resid = (p: number) => {
      const r = data[p * 4];
      const g = data[p * 4 + 1];
      const b = data[p * 4 + 2];
      const s = Math.max(0, r * cr + g * cg + b * cb);
      const dr = r - s * cr;
      const dg = g - s * cg;
      const db = b - s * cb;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    const R = 30;
    let rsum = 0;
    let rhit = 0;
    for (const p of topSamples) {
      const rv = resid(p);
      rsum += rv * rv;
      if (rv <= R) rhit++;
    }
    // 顶部背景须紧贴明暗线,否则是复杂背景(户外照等),判不适用
    if (Math.sqrt(rsum / n) > 12 || rhit / n < 0.95) return null;
    near = (p) => resid(p) <= R;
    nearGrow = (p) => resid(p) <= R * 1.9;
    needSmooth = true;
    // 照片的发梢常带背景色相的轮廓光(红底红边光),色键必然啃出锯齿 → 闭运算半径加大补齐
    closeR = Math.max(3, Math.round((16 * Math.max(w, h)) / WORK_SIDE));
    // 去雾边用:只对「亮度足够(明暗线投影 s>60)且贴线」的可见彩雾衰减(0=背景雾 → 1=人物)。
    // 黑发也在线附近(线过原点),暗像素误杀会把整头黑发削成半透明(实测踩坑);
    // 暗像素在白底上只像发影,不构成彩色雾圈,放过
    bgLikeness = (p) => {
      const s = data[p * 4] * cr + data[p * 4 + 1] * cg + data[p * 4 + 2] * cb;
      if (s <= 60) return 1;
      return Math.min(1, resid(p) / R);
    };
  }
  const lum = (p: number) => data[p * 4] * 0.5 + data[p * 4 + 1] * 0.3 + data[p * 4 + 2] * 0.2;
  const smoothOk = (p: number, q: number) => {
    // 深阴影区对比度被压缩,平滑阈放宽(两端都暗才放宽;亮区边界从严,防渗入人物)
    const eps = lum(p) < 70 && lum(q) < 70 ? 20 : EPS_SMOOTH;
    return (
      Math.abs(data[p * 4] - data[q * 4]) <= eps &&
      Math.abs(data[p * 4 + 1] - data[q * 4 + 1]) <= eps &&
      Math.abs(data[p * 4 + 2] - data[q * 4 + 2]) <= eps
    );
  };

  // A 模式底部保护带:半身像的底边必是人物衣着或其两侧背景,衣服底部阴影带与背景同色且
  // 底行无纵向梯度(屏障失效),泛洪会从底角沿底行横爬进衣服 → 带内横向扩张一律禁入,
  // 真背景靠泛洪后的"竖向释放"流到底
  const guardY = h - Math.max(3, Math.round(h * BOTTOM_GUARD));
  const guarded = (p: number) => modeA && ((p / w) | 0) >= guardY;

  // 3) 泛洪 = 核心背景(种子只下顶部+上侧:底部边缘是人物衣着,不能当背景)
  const bg = new Uint8Array(w * h); // 1 = 背景
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  const seed = (p: number) => {
    if (!bg[p] && near(p) && !guarded(p)) {
      bg[p] = 1;
      queue[qt++] = p;
    }
  };
  for (const p of topSamples) seed(p);
  // A 模式禁止向上扩张:背景从顶部种子向下/横向即可覆盖全部连通区,需要向上的只有
  // 悬垂下方几像素(受限增长兜底);放开向上会从原画自带的底部背景横带爬进衣服(035/056 实测)
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w;
    const y = (p / w) | 0;
    const cands = [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 && !modeA ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ];
    for (const q of cands) {
      if (q >= 0 && !bg[q] && near(q) && !guarded(q) && (!needSmooth || smoothOk(p, q))) {
        bg[q] = 1;
        queue[qt++] = q;
      }
    }
  }
  // 保护带竖向释放:带内"正上方是背景"的近背景像素放行(真背景在衣服两侧延伸到底边,
  // 只许自上而下传播 —— 横向传播正是钻衣服的路径;释放同样要过梯度屏障,
  // 斜坡衣沿上方悬着背景列,下行撞到轮廓 AA 高梯度即停,不吃进衣服)
  if (modeA) {
    for (let y = guardY; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!bg[p] && near(p) && bg[p - w]) bg[p] = 1;
      }
    }
  }

  // 4) 受限增长:从核心边缘向内最多 GROW_STEPS px 吞掉宽容差内的抗锯齿过渡带
  let frontier: number[] = [];
  for (let p = 0; p < w * h; p++) if (bg[p]) frontier.push(p);
  for (let step = 0; step < GROW_STEPS && frontier.length; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % w;
      const y = (p / w) | 0;
      const cands = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const q of cands) {
        if (q >= 0 && !bg[q] && nearGrow(q) && !guarded(q)) {
          bg[q] = 1;
          next.push(q);
        }
      }
    }
    frontier = next;
  }

  let bgCount = 0;
  for (let p = 0; p < w * h; p++) bgCount += bg[p];
  const ratio = bgCount / (w * h);
  if (ratio < BG_MIN_RATIO || ratio > BG_MAX_RATIO) return null;
  // 顶部两角必须抠掉:弹出布局会露出图片方形上沿,角上有内容就不适合弹出
  if (!bg[w + 1] || !bg[w + w - 2]) return null;

  // 4) 人物掩膜闭运算(膨胀 closeR → 腐蚀 closeR,倒角圆核):填回发顶高光带/细咬边
  const person = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) person[p] = bg[p] ? 0 : 1;
  const rr = closeR * 3; // 倒角权重 ×3 换算
  const dToPerson = chamferDT(person, w, h);
  const dilated = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) dilated[p] = dToPerson[p] <= rr ? 1 : 0;
  const inv = new Uint8Array(w * h);
  let invCount = 0;
  for (let p = 0; p < w * h; p++) {
    inv[p] = dilated[p] ? 0 : 1;
    invCount += inv[p];
  }
  // 膨胀吞满全帧 → 腐蚀失去锚点(DT 无种子处处 INF,闭运算会退化成"整幅都是人物"),判不适用
  if (!invCount) return null;
  const dToOut = chamferDT(inv, w, h);
  const closed = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) closed[p] = dToOut[p] > rr ? 1 : 0;

  // 5) 人物向内收 1px(吃贴边杂色)→ 轻模糊羽化 → 合成透明 webp
  const shrunk = Uint8Array.from(closed);
  for (let p = 0; p < w * h; p++) {
    if (closed[p]) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) shrunk[p - 1] = 0;
    if (x < w - 1) shrunk[p + 1] = 0;
    if (y > 0) shrunk[p - w] = 0;
    if (y < h - 1) shrunk[p + w] = 0;
  }
  // 孤岛清除:与人物主体不连通的小碎块(残补丁/离体浮块)直接丢弃 ——
  // 保留最大连通块 + 面积 ≥ 最大块 2% 的块(整幅只应有一个人物,浮块都是抠像残渣)
  {
    const label = new Int32Array(w * h).fill(-1);
    const sizes: number[] = [];
    const q2 = new Int32Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
      if (!shrunk[p0] || label[p0] >= 0) continue;
      const id = sizes.length;
      let qh2 = 0;
      let qt2 = 0;
      q2[qt2++] = p0;
      label[p0] = id;
      let size = 0;
      while (qh2 < qt2) {
        const p = q2[qh2++];
        size++;
        const x = p % w;
        const y = (p / w) | 0;
        const cands = [
          x > 0 ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y > 0 ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ];
        for (const nq of cands) {
          if (nq >= 0 && shrunk[nq] && label[nq] < 0) {
            label[nq] = id;
            q2[qt2++] = nq;
          }
        }
      }
      sizes.push(size);
    }
    const maxSize = Math.max(0, ...sizes);
    for (let p = 0; p < w * h; p++) {
      if (shrunk[p] && sizes[label[p]] < maxSize * 0.02) shrunk[p] = 0;
    }
  }

  // 内部孔洞回填:不与画面边界连通的透明区(被人物完全围住)填回原图像素 ——
  // 抠像只剥外部背景,人物内部(发丝间的缝隙/高光)保持原图本来的样子;
  // 否则背景圆圈的颜色从洞里透出来,比原图"更空"(用户实报:头顶空缺)
  {
    const open = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) open[p] = shrunk[p] ? 0 : 1;
    const lbl = new Int32Array(w * h).fill(-1);
    const touchesBorder: boolean[] = [];
    const q3 = new Int32Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
      if (!open[p0] || lbl[p0] >= 0) continue;
      const id = touchesBorder.length;
      touchesBorder.push(false);
      let qh3 = 0;
      let qt3 = 0;
      q3[qt3++] = p0;
      lbl[p0] = id;
      while (qh3 < qt3) {
        const p = q3[qh3++];
        const x = p % w;
        const y = (p / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder[id] = true;
        const cands = [
          x > 0 ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y > 0 ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ];
        for (const nq of cands) {
          if (nq >= 0 && open[nq] && lbl[nq] < 0) {
            lbl[nq] = id;
            q3[qt3++] = nq;
          }
        }
      }
    }
    for (let p = 0; p < w * h; p++) {
      if (open[p] && !touchesBorder[lbl[p]]) shrunk[p] = 1;
    }
  }

  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = shrunk[p] ? 255 : 0;
  // 去雾边(仅照片模式):闭运算会把发丝间/轮廓边的真背景条一并"填"回 → 头像放大后人物
  // 周围一圈虚色雾边。只在「离透明区 ≤ closeR」的外缘带里按背景相似度衰减 alpha
  // (纯背景色→0,人物色→保留);内部的高光带(闭运算的本意)离边远,不受影响
  if (bgLikeness) {
    const openMask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) openMask[p] = shrunk[p] ? 0 : 1;
    const dToOpen = chamferDT(openMask, w, h);
    const band = (closeR + 1) * 3; // 倒角权重 ×3 换算
    for (let p = 0; p < w * h; p++) {
      if (alpha[p] && dToOpen[p] <= band) alpha[p] = Math.round(alpha[p] * bgLikeness(p));
    }
  }
  // ⚠ blur 管线会把单通道提升为 3 通道,必须 toColourspace('b-w') 压回 1 通道,
  //   否则 joinChannel 按 1 通道读 3 通道数据 → 条纹 + 三倍高鬼影(实测踩坑)
  const { data: feathered, info: fInfo } = await sharp(alpha, {
    raw: { width: w, height: h, channels: 1 },
  })
    .blur(needSmooth ? 1.0 : 0.8)
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (fInfo.channels !== 1) return null;

  const rgb = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    rgb[p * 3] = data[p * 4];
    rgb[p * 3 + 1] = data[p * 4 + 1];
    rgb[p * 3 + 2] = data[p * 4 + 2];
  }
  const rgba = sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).joinChannel(feathered, {
    raw: { width: w, height: h, channels: 1 },
  });
  return squareWebp(rgba, w, h);
}
