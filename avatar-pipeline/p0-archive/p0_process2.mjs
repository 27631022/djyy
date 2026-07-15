// 第二轮:三风格 i2i 发型测试的差分统计 + 提取回贴
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/web/djyy/backend/package.json');
const sharp = require('sharp');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw2');
const PREV = path.join(HERE, 'preview2');
const SIZE = 1024;

function findRaw(name) {
  for (const ext of ['png', 'jpg', 'webp']) {
    const f = path.join(RAW, `${name}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function loadRaw(name) {
  const f = findRaw(name);
  if (!f) return null;
  const { data, info } = await sharp(f).resize(SIZE, SIZE, { fit: 'cover' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

async function savePng(img, file) {
  await sharp(img.data, { raw: { width: img.info.width, height: img.info.height, channels: 4 } }).png().toFile(file);
}

for (const style of ['clay', 'pixar', 'flat2d']) {
  const v = await loadRaw(`${style}_male_hair`);
  const b = await loadRaw(`${style}_male`);
  if (!v || !b) { console.log(`跳过 ${style}(缺图)`); continue; }
  const out = Buffer.from(v.data);
  let changed = 0, changedLower = 0;
  const TH = 60;
  for (let i = 0; i < v.data.length; i += 4) {
    const d = Math.abs(v.data[i] - b.data[i]) + Math.abs(v.data[i + 1] - b.data[i + 1]) + Math.abs(v.data[i + 2] - b.data[i + 2]);
    if (d > TH) {
      changed++;
      if (Math.floor(i / 4 / v.info.width) > v.info.height * 0.55) changedLower++;
    } else out[i + 3] = 0;
  }
  const px = v.data.length / 4;
  await savePng({ data: out, info: v.info }, path.join(RAW, `${style}_hair_extract.png`));
  // 提取件回贴基准
  const baseFile = findRaw(`${style}_male`);
  const basePng = await sharp(baseFile).resize(SIZE, SIZE, { fit: 'cover' }).png().toBuffer();
  await sharp(basePng).composite([{ input: path.join(RAW, `${style}_hair_extract.png`), left: 0, top: 0 }]).jpeg({ quality: 85 }).toFile(path.join(PREV, `${style}_hair_reattach.jpg`));
  await sharp(path.join(RAW, `${style}_hair_extract.png`)).resize(512, 512, { fit: 'inside' }).flatten({ background: '#f0f0f0' }).jpeg({ quality: 82 }).toFile(path.join(PREV, `${style}_hair_extract.jpg`));
  console.log(`${style}: 变化像素 ${((changed / px) * 100).toFixed(1)}%, 下半区误改 ${((changedLower / px) * 100).toFixed(1)}%`);
}
console.log('done');
