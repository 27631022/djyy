// P0 后处理:绿幕色键抠图 → 透明 PNG;叠层合成对位测试;策略B 差分提取
// 用法: node p0_process.mjs
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/web/djyy/backend/package.json');
const sharp = require('sharp');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const KEYED = path.join(HERE, 'keyed');
const COMP = path.join(HERE, 'composite');
const PREV = path.join(HERE, 'preview');
for (const d of [KEYED, COMP, PREV]) fs.mkdirSync(d, { recursive: true });

function findRaw(name) {
  for (const ext of ['png', 'jpg', 'webp']) {
    const f = path.join(RAW, `${name}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

const SIZE = 1024; // 统一处理尺寸(2K 原图先降到 1024,量产再定)

async function loadRaw(name) {
  const f = findRaw(name);
  if (!f) return null;
  const { data, info } = await sharp(f)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

/**
 * 绿幕色键:greenness = g - max(r,b)。>HI 全透明,<LO 全保留,之间羽化。
 * 同时做去溢色(despill):保留区把 g 钳到 max(r,b)+DESPILL_SLACK。
 */
function chromaKey(img, { hi = 90, lo = 20, despill = 24 } = {}) {
  const { data, info } = img;
  const out = Buffer.from(data);
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const greenness = g - Math.max(r, b);
    let a = 255;
    if (greenness >= hi) a = 0;
    else if (greenness > lo) a = Math.round(255 * (1 - (greenness - lo) / (hi - lo)));
    out[i + 3] = Math.min(out[i + 3], a);
    if (a > 0 && greenness > 0) {
      out[i + 1] = Math.min(g, Math.max(r, b) + despill); // 去绿边
    }
    if (a === 255) opaque++;
  }
  return { data: out, info, opaqueRatio: opaque / (data.length / 4) };
}

async function savePng(img, file) {
  await sharp(img.data, { raw: { width: img.info.width, height: img.info.height, channels: 4 } })
    .png()
    .toFile(file);
  return fs.statSync(file).size;
}

/** 非透明像素包围盒(评估部件占位) */
function bbox(img) {
  const { data, info } = img;
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 32) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// —— 每部件叠放变换(看图后手调,量产对应 manifest 锚点) ——
const TRANSFORM = {
  hair_m_short: { scale: 1.12, dx: 0, dy: -170 },
  hair_f_long: { scale: 1.2, dx: 0, dy: -110 },
  hair_f_bun: { scale: 1.2, dx: 0, dy: -120 },
  eyes_round: { scale: 0.46, dx: 0, dy: -48 },
  eyes_happy: { scale: 0.5, dx: 0, dy: -55 },
  acc_glasses: { scale: 0.68, dx: 0, dy: 0 },
};

async function overlayBuf(name, keyedFile) {
  const t = TRANSFORM[name] ?? { scale: 1, dx: 0, dy: 0 };
  const side = Math.round(SIZE * t.scale);
  let left = Math.round((SIZE - side) / 2 + t.dx);
  let top = Math.round((SIZE - side) / 2 + t.dy);
  // 裁掉落在画布外的部分(sharp 要求 overlay 不越界)
  const x0 = Math.max(0, -left);
  const y0 = Math.max(0, -top);
  left = Math.max(0, left);
  top = Math.max(0, top);
  const w = Math.min(side - x0, SIZE - left);
  const h = Math.min(side - y0, SIZE - top);
  const buf = await sharp(keyedFile)
    .resize(side, side)
    .extract({ left: x0, top: y0, width: w, height: h })
    .png()
    .toBuffer();
  return { input: buf, left, top };
}

async function composite(outName, baseName, partNames) {
  const baseFile = path.join(KEYED, `${baseName}.png`);
  if (!fs.existsSync(baseFile)) return console.log(`跳过合成 ${outName}(缺 ${baseName})`);
  const layers = [];
  for (const p of partNames) {
    const f = path.join(KEYED, `${p}.png`);
    if (!fs.existsSync(f)) {
      console.log(`  合成 ${outName}: 缺部件 ${p},跳过该层`);
      continue;
    }
    layers.push(await overlayBuf(p, f));
  }
  const out = path.join(COMP, `${outName}.png`);
  await sharp(baseFile).composite(layers).png().toFile(out);
  console.log(`合成 ${outName}.png`);
}

// —— 策略B:差分提取(变体图 vs 基准图,同底无需先抠图) ——
async function diffExtract(variantName, baseName) {
  const v = await loadRaw(variantName);
  const b = await loadRaw(baseName);
  if (!v || !b) return console.log(`跳过差分 ${variantName}`);
  const { data: vd, info } = v;
  const bd = b.data;
  const out = Buffer.from(vd);
  let changed = 0, changedLower = 0;
  const TH = 60; // |Δr|+|Δg|+|Δb| 阈值
  for (let i = 0; i < vd.length; i += 4) {
    const d = Math.abs(vd[i] - bd[i]) + Math.abs(vd[i + 1] - bd[i + 1]) + Math.abs(vd[i + 2] - bd[i + 2]);
    if (d > TH) {
      changed++;
      const y = Math.floor(i / 4 / info.width);
      if (y > info.height * 0.55) changedLower++; // 下半区变化=非发型区被改动(i2i 保持度差)
    } else {
      out[i + 3] = 0;
    }
  }
  const px = vd.length / 4;
  const img = { data: out, info };
  await savePng(img, path.join(KEYED, `${variantName}.diff.png`));
  console.log(
    `差分 ${variantName}: 变化像素 ${((changed / px) * 100).toFixed(1)}%,其中下半区(疑似误改) ${((changedLower / px) * 100).toFixed(1)}%`,
  );
}

// ============ 主流程 ============
const ALL = [
  'base_male', 'base_female',
  'hair_m_short', 'hair_f_long', 'hair_f_bun',
  'eyes_round', 'eyes_happy', 'acc_glasses',
  'b_hair_short', 'b_hair_curly', 'b_glasses',
];

for (const name of ALL) {
  const img = await loadRaw(name);
  if (!img) {
    console.log(`缺 raw: ${name}`);
    continue;
  }
  const keyed = chromaKey(img);
  const size = await savePng(keyed, path.join(KEYED, `${name}.png`));
  const box = bbox(keyed);
  console.log(
    `抠图 ${name}: 不透明占比 ${(keyed.opaqueRatio * 100).toFixed(0)}%, bbox=${box ? `${box.w}x${box.h}@(${box.x},${box.y})` : '空'}, PNG ${(size / 1024).toFixed(0)}KB`,
  );
}

// 合成测试(零偏移起步,看图后调 TRANSFORM 重跑)
await composite('A_male_short', 'base_male', ['hair_m_short']);
await composite('A_male_short_glasses', 'base_male', ['hair_m_short', 'acc_glasses']);
await composite('A_female_long', 'base_female', ['hair_f_long']);
await composite('A_female_bun_happy', 'base_female', ['hair_f_bun', 'eyes_happy']);
await composite('A_female_eyes_round', 'base_female', ['eyes_round']);

// 策略B 差分
await diffExtract('b_hair_short', 'base_male');
await diffExtract('b_hair_curly', 'base_male');
await diffExtract('b_glasses', 'base_male');

// 策略B 提取件回贴(同基准=应完美;跨性别=考察可移植性)
await composite('B_male_extract_hair', 'base_male', ['b_hair_short.diff']);
await composite('B_male_extract_glasses', 'base_male', ['b_glasses.diff']);
await composite('B_male_curly_plus_glasses', 'base_male', ['b_hair_curly.diff', 'b_glasses.diff']);
await composite('B_cross_female_hair', 'base_female', ['b_hair_short.diff']);

// 预览图(512,方便视检)
for (const dir of [RAW, KEYED, COMP]) {
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(png|jpg|webp)$/.test(f)) continue;
    const label = path.basename(dir);
    await sharp(path.join(dir, f))
      .resize(512, 512, { fit: 'inside' })
      .flatten({ background: dir === RAW ? '#ffffff' : '#f0f0f0' })
      .jpeg({ quality: 82 })
      .toFile(path.join(PREV, `${label}__${f.replace(/\.\w+$/, '')}.jpg`));
  }
}
console.log('预览图已出:', PREV);
