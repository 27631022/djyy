// 部件生产:定稿基准头 i2i「只改X其余不变」→ 与基准差分提取 → 去斑 → 1024 全画布 webp 部件
// 用法: ARK_KEY=<key> [ARK_MODEL=<model>] node gen-parts.mjs [gen|extract|all]
// 产物: raw/ (i2i 原图 png) + out/ (提取的部件 webp + 基准 webp)
// 部件放进前端 = 复制 out/*.webp 到 react/src/features/avatar/studio/packs/<pack>/assets/ 并在 manifest 注册
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/web/djyy/backend/package.json');
const axios = require('axios');
const sharp = require('sharp');

const KEY = process.env.ARK_KEY;
const MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-260128';
const API = 'https://ark.cn-beijing.volces.com/api/v3';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASES = path.join(HERE, 'bases');
const RAW = path.join(HERE, 'raw');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const KEEP =
  '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、身体比例、光照和纯绿色背景完全不变,';
const STYLE = ',与画面整体3D卡通风格一致';

/** 部件清单:id = <gender>/<slot>/<variant> */
const PARTS = [
  { id: 'male/hair/short-black', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色短发${STYLE}` },
  { id: 'male/hair/curly-brown', base: 'base-male', prompt: `${KEEP}只给他加上一头棕色微卷中分短发${STYLE}` },
  { id: 'male/hair/buzz', base: 'base-male', prompt: `${KEEP}只给他加上一头利落的黑色寸头(极短的贴头皮短发)${STYLE}` },
  { id: 'male/glasses/round-black', base: 'base-male', prompt: `${KEEP}只给他戴上一副黑色圆框眼镜${STYLE}` },
  { id: 'male/beard/stubble', base: 'base-male', prompt: `${KEEP}只给他加上短短的络腮胡${STYLE}` },
  { id: 'female/hair/bob-brown', base: 'base-female', prompt: `${KEEP}只给她加上一头深棕色齐肩直发(带整齐刘海)${STYLE}` },
  { id: 'female/hair/bun-black', base: 'base-female', prompt: `${KEEP}只给她加上黑色高丸子头发型${STYLE}` },
  { id: 'female/hair/ponytail-brown', base: 'base-female', prompt: `${KEEP}只给她加上棕色高马尾发型${STYLE}` },
];

const rawFile = (id) => path.join(RAW, id.replace(/\//g, '__') + '.png');

async function gen(part) {
  const baseFile = path.join(BASES, `${part.base}.jpg`);
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(baseFile).toString('base64')}`;
  const t0 = Date.now();
  const resp = await axios.post(
    `${API}/images/generations`,
    {
      model: MODEL,
      prompt: part.prompt,
      image: dataUrl,
      sequential_image_generation: 'disabled',
      response_format: 'url',
      size: '2K',
      output_format: 'png', // 无损输出:差分提取不吃 JPEG 压缩噪点
      watermark: false,
    },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, timeout: 180_000 },
  );
  const url = resp.data?.data?.[0]?.url;
  if (!url) throw new Error(`${part.id}: 无 url`);
  const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 });
  fs.writeFileSync(rawFile(part.id), Buffer.from(img.data));
  console.log(`GEN ${part.id}  ${(img.data.byteLength / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const SIZE = 1024;
const TH = 60; // 差分阈值 |ΔR|+|ΔG|+|ΔB|

async function loadRaw1024(file) {
  return sharp(file).resize(SIZE, SIZE, { fit: 'cover' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** 去斑:少于 minNeighbors 个不透明邻居的像素置透明,迭代 iters 轮(近似形态学开运算,清孤立噪点) */
function despeckle(data, w, h, { minNeighbors = 3, iters = 2 } = {}) {
  for (let it = 0; it < iters; it++) {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] === 0) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const yy = y + dy, xx = x + dx;
            if (yy >= 0 && yy < h && xx >= 0 && xx < w && alpha[yy * w + xx] > 0) n++;
          }
        }
        if (n < minNeighbors) data[i * 4 + 3] = 0;
      }
    }
  }
}

/** 去绿溢色:不透明像素把 g 钳到 max(r,b)+slack(绿幕相邻像素的绿色渗染) */
function despill(data, slack = 6) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const cap = Math.max(data[i], data[i + 2]) + slack;
    if (data[i + 1] > cap) data[i + 1] = cap;
  }
}

/**
 * 绿边裁剪:贴着透明区(≤2px)且偏绿(greenness>th)的像素直接裁掉,迭代收敛。
 * 发丝与绿幕的抗锯齿过渡像素(半绿半发色)despill 压不住 —— 只能裁。
 */
function trimGreenEdge(data, w, h, { th = 14, radius = 2, iters = 3, minLum = 0 } = {}) {
  for (let it = 0; it < iters; it++) {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] === 0) continue;
        const p = i * 4;
        const greenness = data[p + 1] - Math.max(data[p], data[p + 2]);
        if (greenness <= th) continue;
        if (minLum > 0 && (data[p] + data[p + 1] + data[p + 2]) / 3 <= minLum) continue;
        let nearEdge = false;
        for (let dy = -radius; dy <= radius && !nearEdge; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w || alpha[yy * w + xx] === 0) {
              nearEdge = true;
              break;
            }
          }
        }
        if (nearEdge) {
          data[p + 3] = 0;
          changed++;
        }
      }
    }
    if (!changed) break;
  }
}

/** 绿幕色键:greenness=g-max(r,b),>hi 全透明,<lo 保留,之间羽化 */
function chromaKey(data, { hi = 90, lo = 20 } = {}) {
  for (let i = 0; i < data.length; i += 4) {
    const greenness = data[i + 1] - Math.max(data[i], data[i + 2]);
    let a = 255;
    if (greenness >= hi) a = 0;
    else if (greenness > lo) a = Math.round(255 * (1 - (greenness - lo) / (hi - lo)));
    data[i + 3] = Math.min(data[i + 3], a);
  }
}

/**
 * 连通域分析:返回每个 alpha>0 连通域的 {area, greenish, pixels}。
 * 用于 ① 清游丝/弧线(小面积或绿色占比高的孤立域)② 孔洞填充的补集判定。
 */
function components(data, w, h) {
  const label = new Int32Array(w * h); // 0=未访问
  const comps = [];
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const si = sy * w + sx;
      if (label[si] !== 0 || data[si * 4 + 3] === 0) continue;
      const id = comps.length + 1;
      let head = 0, tail = 0, area = 0, green = 0;
      const pixels = [];
      qx[tail] = sx; qy[tail] = sy; tail++;
      label[si] = id;
      while (head < tail) {
        const x = qx[head], y = qy[head]; head++;
        const i = y * w + x;
        area++;
        pixels.push(i);
        const p = i * 4;
        if (data[p + 1] - Math.max(data[p], data[p + 2]) > 10) green++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const ii = yy * w + xx;
          if (label[ii] === 0 && data[ii * 4 + 3] > 0) {
            label[ii] = id;
            qx[tail] = xx; qy[tail] = yy; tail++;
          }
        }
      }
      comps.push({ area, greenRatio: green / area, pixels });
    }
  }
  return comps;
}

/** 清游丝:面积 < minArea,或(面积 < largest*0.05 且偏绿占比高)的孤立连通域整域裁掉 */
function dropStrayComponents(data, w, h, { minArea = 900 } = {}) {
  const comps = components(data, w, h);
  const largest = Math.max(1, ...comps.map((c) => c.area));
  let dropped = 0;
  for (const c of comps) {
    const stray = c.area < minArea || (c.area < largest * 0.05 && c.greenRatio > 0.3);
    if (!stray) continue;
    for (const i of c.pixels) data[i * 4 + 3] = 0;
    dropped++;
  }
  return dropped;
}

/**
 * 孔洞填充:部件内部「变化小于差分阈值」的小透明洞(发丝过渡区)会透出基准光头皮肤 —— 回填。
 * 从画布边界 flood fill 透明区,填不到的透明像素=内部洞;只填 < maxHoleArea 的洞
 * (眼镜镜片是合法大"洞",要透出基准的眼睛,不能填)。洞内 RGB 就是变体图原像素,置回 alpha 即可。
 */
function fillHoles(data, w, h, { maxHoleArea = 3000 } = {}) {
  const outside = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (x, y) => {
    const i = y * w + x;
    if (outside[i] || data[i * 4 + 3] > 0) return;
    outside[i] = 1;
    qx[tail] = x; qy[tail] = y; tail++;
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // 内部透明洞 = 既非不透明也非 outside;按洞连通域分组,小洞回填
  const visited = new Uint8Array(w * h);
  let filled = 0;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const si = sy * w + sx;
      if (visited[si] || outside[si] || data[si * 4 + 3] > 0) continue;
      let hh = 0, tt = 0;
      const hole = [];
      qx[tt] = sx; qy[tt] = sy; tt++;
      visited[si] = 1;
      while (hh < tt) {
        const x = qx[hh], y = qy[hh]; hh++;
        const i = y * w + x;
        hole.push(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const ii = yy * w + xx;
          if (!visited[ii] && !outside[ii] && data[ii * 4 + 3] === 0) {
            visited[ii] = 1;
            qx[tt] = xx; qy[tt] = yy; tt++;
          }
        }
      }
      if (hole.length <= maxHoleArea) {
        for (const i of hole) data[i * 4 + 3] = 255;
        filled++;
      }
    }
  }
  return filled;
}

/**
 * 细亮光晕专杀:i2i 常在发型轮廓外画一圈淡色残晕(细弧),不带绿、两端连着主体 ——
 * 色键/游丝清理都拿它没办法。判定 = 「细」(腐蚀 radius 后不存活、膨胀恢复不回来)且「亮」(lum>th)。
 * 深色发丝尖端(暗)、黑镜腿(暗)不受影响;误伤上限是镜框上的小高光点,视觉可忽略。
 */
function removeThinBrightHalo(data, w, h, { radius = 2, lumTh = 140 } = {}) {
  const n = w * h;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  // 腐蚀:radius 邻域全不透明才存活
  const eroded = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    outer: for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!alpha[i]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w || !alpha[yy * w + xx]) continue outer;
        }
      }
      eroded[i] = 1;
    }
  }
  // 膨胀恢复(radius+1):主体边缘回得来,整体细于 ~2*radius 的结构回不来
  const keep = new Uint8Array(n);
  const R = radius + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!eroded[y * w + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) keep[yy * w + xx] = 1;
        }
      }
    }
  }
  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (!alpha[i] || keep[i]) continue;
    const p = i * 4;
    if ((data[p] + data[p + 1] + data[p + 2]) / 3 > lumTh) {
      data[p + 3] = 0;
      removed++;
    }
  }
  return removed;
}

async function extract(part) {
  const vFile = rawFile(part.id);
  if (!fs.existsSync(vFile)) return console.log(`跳过 ${part.id}(缺 raw)`);
  const v = await loadRaw1024(vFile);
  const b = await loadRaw1024(path.join(BASES, `${part.base}.jpg`));
  const out = Buffer.from(v.data);
  // 羽化差分:d≤FE_LO 透明,d≥FE_HI 不透明,之间线性 —— 发际线/镜框阴影的过渡不再是硬边补丁
  const FE_LO = 40, FE_HI = 90;
  for (let i = 0; i < v.data.length; i += 4) {
    const d =
      Math.abs(v.data[i] - b.data[i]) +
      Math.abs(v.data[i + 1] - b.data[i + 1]) +
      Math.abs(v.data[i + 2] - b.data[i + 2]);
    const a = d <= FE_LO ? 0 : d >= FE_HI ? 255 : Math.round(((d - FE_LO) / (FE_HI - FE_LO)) * 255);
    out[i + 3] = Math.min(out[i + 3], a);
  }
  // 后处理链:色键清绿残块(lo 下探到浅绿,清 i2i 头顶光晕) → 清游丝 → 孔洞回填(露头皮)
  //          → 绿边裁剪(暗绿) → 亮绿光晕专项裁剪 → 去溢色
  chromaKey(out, { hi: 90, lo: 35 });
  despeckle(out, v.info.width, v.info.height);
  const strays = dropStrayComponents(out, v.info.width, v.info.height);
  const holes = fillHoles(out, v.info.width, v.info.height);
  trimGreenEdge(out, v.info.width, v.info.height);
  trimGreenEdge(out, v.info.width, v.info.height, { th: 6, radius: 3, iters: 4, minLum: 135 });
  const halo = removeThinBrightHalo(out, v.info.width, v.info.height);
  despeckle(out, v.info.width, v.info.height); // 光晕裁剪后可能留孤点,再扫一遍
  despill(out);
  if (strays || holes || halo)
    console.log(`  · ${part.id}: 游丝 ${strays} 域 / 回填洞 ${holes} / 光晕像素 ${halo}`);
  const file = path.join(OUT, part.id.replace(/\//g, '__') + '.webp');
  await sharp(out, { raw: { width: v.info.width, height: v.info.height, channels: 4 } })
    .webp({ quality: 90 })
    .toFile(file);
  console.log(`EXT ${part.id}  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

/** 基准图:绿幕抠掉 → 透明底(编辑器成品透明背景/自选背景色的前提) */
async function exportBases() {
  for (const b of ['base-male', 'base-female']) {
    const { data, info } = await loadRaw1024(path.join(BASES, `${b}.jpg`));
    const out = Buffer.from(data);
    chromaKey(out);
    despeckle(out, info.width, info.height);
    trimGreenEdge(out, info.width, info.height);
    despill(out);
    const file = path.join(OUT, `${b}.webp`);
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ quality: 90 })
      .toFile(file);
    console.log(`BASE ${b}(透明底)  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
  }
}

async function pool(jobs, limit) {
  const q = [...jobs];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (q.length) {
        const j = q.shift();
        try {
          await j();
        } catch (e) {
          console.error('FAIL:', e?.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : String(e?.message ?? e));
        }
      }
    }),
  );
}

const mode = process.argv[2] ?? 'all';
if (mode === 'gen' || mode === 'all') {
  if (!KEY) { console.error('缺 ARK_KEY'); process.exit(1); }
  await pool(PARTS.filter((p) => !fs.existsSync(rawFile(p.id))).map((p) => () => gen(p)), 2);
}
if (mode === 'extract' || mode === 'all') {
  await exportBases();
  for (const p of PARTS) await extract(p);
}
console.log('done');
