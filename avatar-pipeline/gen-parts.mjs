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
function trimGreenEdge(data, w, h, { th = 14, radius = 2, iters = 3 } = {}) {
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

async function extract(part) {
  const vFile = rawFile(part.id);
  if (!fs.existsSync(vFile)) return console.log(`跳过 ${part.id}(缺 raw)`);
  const v = await loadRaw1024(vFile);
  const b = await loadRaw1024(path.join(BASES, `${part.base}.jpg`));
  const out = Buffer.from(v.data);
  for (let i = 0; i < v.data.length; i += 4) {
    const d =
      Math.abs(v.data[i] - b.data[i]) +
      Math.abs(v.data[i + 1] - b.data[i + 1]) +
      Math.abs(v.data[i + 2] - b.data[i + 2]);
    if (d <= TH) out[i + 3] = 0;
  }
  // 部件像素若落在原绿幕区(发梢盖住背景处),边缘吃了绿色抗锯齿:
  // 色键清偏绿残块 → 去斑 → 绿边裁剪(贴边偏绿像素) → 去溢色
  chromaKey(out, { hi: 100, lo: 60 });
  despeckle(out, v.info.width, v.info.height);
  trimGreenEdge(out, v.info.width, v.info.height);
  despill(out);
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
