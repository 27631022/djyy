// 第三轮:3D卡通写实定稿候选 —— 头占70%、脖子自然(不过细),男女各2候选
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
const MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-260128';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw2');
const PREV = path.join(HERE, 'preview2');

const PROP =
  '卡通Q版大头比例:头部非常大,头身比极度夸张(头部约占画面高度的70%),脖子短而自然、粗细正常(不要过细的脖子),肩膀窄、上身很小,画面只画到胸口为止(胸像),人物居中,头顶上方留少量空隙,';
const PIXAR =
  '3D卡通写实风格(皮克斯/迪士尼动画电影角色质感),高质量三维渲染,细腻皮肤质感带次表面散射,大而有神的眼睛,柔和摄影棚光从正上方略偏左打光,正面平视视角,纯绿色背景(#00FF00绿幕),绿色背景上没有任何阴影或投影,画面中无文字无水印';
const MALE = '一个光头男性卡通胸像,完全没有头发、头皮光滑,友善微笑,五官简洁友好,穿深蓝色圆领T恤,';
const FEMALE = '一个光头女性卡通胸像,完全没有头发、头皮光滑,友善微笑,五官简洁友好,穿米白色圆领T恤,';

const GAZE = '双眼直视正前方镜头,目光不偏斜,';
const JOBS = [
  { name: 'pixar3_male_a', prompt: MALE + PROP + PIXAR },
  { name: 'pixar3_male_b', prompt: MALE + PROP + PIXAR },
  { name: 'pixar3_female_a', prompt: FEMALE + PROP + PIXAR },
  { name: 'pixar3_female_b', prompt: FEMALE + PROP + PIXAR },
  { name: 'pixar3_male_c', prompt: MALE + GAZE + PROP + PIXAR },
  { name: 'pixar3_female_c', prompt: FEMALE + GAZE + PROP + PIXAR },
];

function findRaw(name) {
  for (const ext of ['png', 'jpg', 'webp']) {
    const f = path.join(RAW, `${name}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function gen(name, prompt) {
  const t0 = Date.now();
  const resp = await axios.post(`${API}/images/generations`, {
    model: MODEL, prompt, sequential_image_generation: 'disabled', response_format: 'url', size: '2K', watermark: false,
  }, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, timeout: 280_000 });
  const url = resp.data?.data?.[0]?.url;
  if (!url) throw new Error(`${name}: 无 url`);
  const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 });
  const ct = String(img.headers['content-type'] ?? '');
  const ext = ct.includes('png') ? 'png' : 'jpg';
  fs.writeFileSync(path.join(RAW, `${name}.${ext}`), Buffer.from(img.data));
  console.log(`OK ${name}.${ext}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const q = JOBS.filter((j) => !findRaw(j.name));
await Promise.all(Array.from({ length: 2 }, async () => {
  while (q.length) {
    const j = q.shift();
    try { await gen(j.name, j.prompt); } catch (e) {
      console.error('FAIL', j.name, String(e?.message ?? e).slice(0, 200));
    }
  }
}));

for (const f of fs.readdirSync(RAW)) {
  if (!f.startsWith('pixar3_') || !/\.(png|jpg)$/.test(f)) continue;
  await sharp(path.join(RAW, f)).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(path.join(PREV, f.replace(/\.\w+$/, '.jpg')));
}
console.log('done');
