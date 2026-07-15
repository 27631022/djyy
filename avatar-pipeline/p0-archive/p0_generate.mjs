// P0 粘土素材试产:豆包 Seedream t2i/i2i 出图
// 策略A = 逐部件独立生成(绿幕);策略B = 基准头 i2i 局部替换
// 用法: ARK_KEY=<key> node p0_generate.mjs [only]   only 可选: bases|parts|i2i
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/web/djyy/backend/package.json');
const axios = require('axios');

const KEY = process.env.ARK_KEY;
if (!KEY) {
  console.error('缺 ARK_KEY 环境变量');
  process.exit(1);
}
const API = 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL = 'doubao-seedream-5-0-260128';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
fs.mkdirSync(RAW, { recursive: true });

// —— 通用风格尾缀(所有提示词共用,保证光照/质感一致) ——
const STYLE =
  '粘土定格动画风格,3D软陶超轻粘土质感,哑光表面,柔和摄影棚光从正上方略偏左打光,色彩明快,正面平视视角,居中构图,纯绿色背景(#00FF00绿幕),物体边缘干净,绿色背景上没有任何阴影或投影,画面中无文字无水印';

// —— 策略A:基准头(光头素体,五官简洁,部件会覆盖) ——
const BASES = [
  {
    name: 'base_male',
    prompt:
      '一个光头男性卡通半身头像(头部+脖子+肩部),完全没有头发,头皮光滑,友善微笑,五官简洁(小黑豆眼睛、细眉毛、微笑嘴巴、简单的鼻子和耳朵),穿深蓝色圆领T恤,头部居中,头顶到下巴约占画面高度的一半,' + STYLE,
  },
  {
    name: 'base_female',
    prompt:
      '一个光头女性卡通半身头像(头部+脖子+肩部),完全没有头发,头皮光滑,友善微笑,五官简洁(小黑豆眼睛、细眉毛、微笑嘴巴、简单的鼻子和耳朵),穿米白色圆领T恤,头部居中,头顶到下巴约占画面高度的一半,' + STYLE,
  },
];

// —— 策略A:独立部件(假发式悬空展示) ——
const PARTS = [
  {
    name: 'hair_m_short',
    prompt:
      '一顶独立展示的男士黑色短发发型,像假发一样悬空展示,下方没有头没有脸,发型内侧开口朝下呈头盔状,居中,大小与成人头部相当,' + STYLE,
  },
  {
    name: 'hair_f_long',
    prompt:
      '一顶独立展示的女士深棕色齐肩长直发发型(带刘海),像假发一样悬空展示,下方没有头没有脸,发型内侧开口朝下呈头盔状,居中,大小与成人头部相当,' + STYLE,
  },
  {
    name: 'hair_f_bun',
    prompt:
      '一顶独立展示的女士黑色丸子头发型(头顶一个圆发髻),像假发一样悬空展示,下方没有头没有脸,发型内侧开口朝下呈头盔状,居中,大小与成人头部相当,' + STYLE,
  },
  {
    name: 'eyes_round',
    prompt:
      '一双独立展示的卡通眼睛部件:两只并排的椭圆形大眼睛,黑色瞳孔带白色高光,悬空居中展示,周围没有脸没有其他五官,两眼间距与卡通人脸双眼间距相当,' + STYLE,
  },
  {
    name: 'eyes_happy',
    prompt:
      '一双独立展示的卡通眯眯笑眼睛部件:两条并排的向下弯的黑色弧线(开心眯眼),悬空居中展示,周围没有脸没有其他五官,两眼间距与卡通人脸双眼间距相当,' + STYLE,
  },
  {
    name: 'acc_glasses',
    prompt: '一副独立展示的黑色圆框眼镜,正面视角,悬空居中展示,周围没有脸,' + STYLE,
  },
];

// —— 策略B:基于 base_male 的 i2i 局部替换 ——
const I2I = [
  {
    name: 'b_hair_short',
    base: 'base_male',
    prompt:
      '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、光照和纯绿色背景完全不变,只给他加上一头黑色短发,发型为粘土质感,与画面整体风格一致',
  },
  {
    name: 'b_hair_curly',
    base: 'base_male',
    prompt:
      '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、光照和纯绿色背景完全不变,只给他加上一头棕色微卷中分短发,发型为粘土质感,与画面整体风格一致',
  },
  {
    name: 'b_glasses',
    base: 'base_male',
    prompt:
      '保持画面中人物的脸型、五官、表情、肤色、发型、衣服、姿势、光照和纯绿色背景完全不变,只给他戴上一副黑色圆框眼镜,眼镜为粘土质感,与画面整体风格一致',
  },
];

async function gen(name, prompt, imageDataUrl) {
  const body = {
    model: MODEL,
    prompt,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    size: '2K',
    watermark: false,
  };
  if (imageDataUrl) body.image = imageDataUrl;
  const t0 = Date.now();
  const resp = await axios.post(`${API}/images/generations`, body, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    timeout: 180_000,
  });
  const url = resp.data?.data?.[0]?.url;
  if (!url) throw new Error(`${name}: 无 url 返回 ${JSON.stringify(resp.data).slice(0, 300)}`);
  const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 });
  const ct = String(img.headers['content-type'] ?? '');
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  const file = path.join(RAW, `${name}.${ext}`);
  fs.writeFileSync(file, Buffer.from(img.data));
  console.log(`OK ${name}.${ext}  ${(img.data.byteLength / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return file;
}

function toDataUrl(file) {
  const buf = fs.readFileSync(file);
  const mime = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function findRaw(name) {
  for (const ext of ['png', 'jpg', 'webp']) {
    const f = path.join(RAW, `${name}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function pool(jobs, limit) {
  const queue = [...jobs];
  const errors = [];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try {
        await job();
      } catch (e) {
        const msg = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 400) : String(e?.message ?? e);
        errors.push(msg);
        console.error('FAIL:', msg);
      }
    }
  });
  await Promise.all(workers);
  return errors;
}

const only = process.argv[2] ?? 'all';
const skipDone = (name) => {
  if (findRaw(name)) {
    console.log(`SKIP ${name}(已存在)`);
    return true;
  }
  return false;
};

// 1) 基准头(策略B依赖,先做)
if (only === 'all' || only === 'bases') {
  const errs = await pool(
    BASES.filter((b) => !skipDone(b.name)).map((b) => () => gen(b.name, b.prompt)),
    2,
  );
  if (errs.length) {
    console.error('基准头有失败,终止');
    process.exit(2);
  }
}

// 2) 独立部件 + i2i 并行
const jobs = [];
if (only === 'all' || only === 'parts') {
  for (const p of PARTS) if (!skipDone(p.name)) jobs.push(() => gen(p.name, p.prompt));
}
if (only === 'all' || only === 'i2i') {
  for (const j of I2I) {
    if (skipDone(j.name)) continue;
    const baseFile = findRaw(j.base);
    if (!baseFile) {
      console.error(`缺基准图 ${j.base},跳过 ${j.name}`);
      continue;
    }
    jobs.push(() => gen(j.name, j.prompt, toDataUrl(baseFile)));
  }
}
const errs = await pool(jobs, 3);
console.log(`\n完成。失败 ${errs.length} 个。产物目录: ${RAW}`);
