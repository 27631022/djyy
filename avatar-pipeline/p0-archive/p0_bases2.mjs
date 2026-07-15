// 基准头第二轮:Q版大头比例 × 三风格(粘土v2 / 3D卡通写实 / 2D扁平) × 男女
// 用法: ARK_KEY=<key> node p0_bases2.mjs [i2i]   无参=6张基准;i2i=对 pixar_male/flat2d_male 加发型测试
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/web/djyy/backend/package.json');
const axios = require('axios');
const sharp = require('sharp');

const KEY = process.env.ARK_KEY;
if (!KEY) { console.error('缺 ARK_KEY'); process.exit(1); }
const API = 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL = 'doubao-seedream-5-0-260128';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw2');
const PREV = path.join(HERE, 'preview2');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(PREV, { recursive: true });

// —— 共用比例约定(用户定案:头大/脖细/身小/只到胸口) ——
const PROP =
  '卡通Q版大头比例:头部很大,头身比夸张(头部约占画面高度的60%),脖子明显细短,肩膀窄、上身很小,画面只画到胸口为止(胸像),人物居中,头顶上方留少量空隙,';

const STYLES = {
  clay:
    '粘土定格动画风格,3D软陶超轻粘土质感,哑光表面,柔和摄影棚光从正上方略偏左打光,色彩明快,正面平视视角,纯绿色背景(#00FF00绿幕),绿色背景上没有任何阴影或投影,画面中无文字无水印',
  pixar:
    '3D卡通写实风格(皮克斯/迪士尼动画电影角色质感),高质量三维渲染,细腻皮肤质感带次表面散射,大而有神的眼睛,柔和摄影棚光从正上方略偏左打光,正面平视视角,纯绿色背景(#00FF00绿幕),绿色背景上没有任何阴影或投影,画面中无文字无水印',
  flat2d:
    '扁平2D矢量插画风格,简洁干净的色块,柔和的描边,现代卡通头像插画,配色细腻和谐,正面平视视角,纯绿色背景(#00FF00纯色背景),背景上没有任何阴影,画面中无文字无水印',
};

const MALE = '一个光头男性卡通胸像,完全没有头发、头皮光滑,友善微笑,五官简洁友好,穿深蓝色圆领T恤,';
const FEMALE = '一个光头女性卡通胸像,完全没有头发、头皮光滑,友善微笑,五官简洁友好,穿米白色圆领T恤,';

const BASES = [];
for (const [style, suffix] of Object.entries(STYLES)) {
  BASES.push({ name: `${style}_male`, prompt: MALE + PROP + suffix });
  BASES.push({ name: `${style}_female`, prompt: FEMALE + PROP + suffix });
}

const I2I = [
  { name: 'pixar_male_hair', base: 'pixar_male', prompt: '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、身体比例、光照和纯绿色背景完全不变,只给他加上一头黑色短发,发型与画面整体风格一致' },
  { name: 'flat2d_male_hair', base: 'flat2d_male', prompt: '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、身体比例、光照和纯绿色背景完全不变,只给他加上一头黑色短发,发型与画面整体风格一致' },
  { name: 'clay_male_hair', base: 'clay_male', prompt: '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、身体比例、光照和纯绿色背景完全不变,只给他加上一头黑色短发,发型与画面整体风格一致' },
];

function findRaw(name) {
  for (const ext of ['png', 'jpg', 'webp']) {
    const f = path.join(RAW, `${name}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function gen(name, prompt, imageDataUrl) {
  const body = { model: MODEL, prompt, sequential_image_generation: 'disabled', response_format: 'url', size: '2K', watermark: false };
  if (imageDataUrl) body.image = imageDataUrl;
  const t0 = Date.now();
  const resp = await axios.post(`${API}/images/generations`, body, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    timeout: 180_000,
  });
  const url = resp.data?.data?.[0]?.url;
  if (!url) throw new Error(`${name}: 无 url`);
  const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 });
  const ct = String(img.headers['content-type'] ?? '');
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  fs.writeFileSync(path.join(RAW, `${name}.${ext}`), Buffer.from(img.data));
  console.log(`OK ${name}.${ext}  ${(img.data.byteLength / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function pool(jobs, limit) {
  const q = [...jobs];
  const errs = [];
  await Promise.all(Array.from({ length: limit }, async () => {
    while (q.length) {
      const j = q.shift();
      try { await j(); } catch (e) {
        const m = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : String(e?.message ?? e);
        errs.push(m); console.error('FAIL:', m);
      }
    }
  }));
  return errs;
}

const mode = process.argv[2] ?? 'bases';
if (mode === 'bases') {
  await pool(BASES.filter((b) => !findRaw(b.name)).map((b) => () => gen(b.name, b.prompt)), 3);
} else if (mode === 'i2i') {
  const jobs = [];
  for (const j of I2I) {
    if (findRaw(j.name)) { console.log(`SKIP ${j.name}`); continue; }
    const f = findRaw(j.base);
    if (!f) { console.error(`缺 ${j.base}`); continue; }
    const buf = fs.readFileSync(f);
    const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    jobs.push(() => gen(j.name, j.prompt, `data:${mime};base64,${buf.toString('base64')}`));
  }
  await pool(jobs, 3);
}

// 预览
for (const f of fs.readdirSync(RAW)) {
  if (!/\.(png|jpg|webp)$/.test(f)) continue;
  await sharp(path.join(RAW, f)).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(path.join(PREV, f.replace(/\.\w+$/, '.jpg')));
}
console.log('完成,预览:', PREV);
