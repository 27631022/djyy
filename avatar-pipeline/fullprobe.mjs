// 全尺寸病灶探针:单件合成 1024 大图 + 指定区域像素数值采样
import { createRequire } from 'node:module';
const sharp = createRequire('file:///D:/web/djyy/backend/package.json')('sharp');
import path from 'node:path';

const ASSETS = path.resolve('../react/src/features/avatar/studio/packs/pixar/assets');
const Z = { clothes: 10, mouth: 15, nose: 16, eyes: 17, brows: 18, beard: 20, accessory: 28, hair: 30, glasses: 40 };

async function full(gender, layers, out, bg = '#fff') {
  const sorted = [...layers].sort((a, b) => Z[a.split('__')[1]] - Z[b.split('__')[1]]);
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: bg } })
    .composite([
      { input: path.join(ASSETS, `base-${gender}.webp`) },
      ...sorted.map((l) => ({ input: path.join(ASSETS, `${l}.webp`) })),
    ])
    .jpeg({ quality: 92 })
    .toFile(out);
  console.log('wrote', out);
}

// 部件 alpha 分析:洞(内部透明)/半透明统计 + 指定框内不透明像素的平均色
async function inspect(name, box) {
  const { data, info } = await sharp(path.join(ASSETS, `${name}.webp`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let op = 0, semi = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 240) op++;
    else if (data[i] > 20) semi++;
  }
  let r = 0, g = 0, b = 0, a = 0, n = 0, trans = 0, tot = 0;
  if (box) {
    for (let y = box[1]; y < box[3]; y++)
      for (let x = box[0]; x < box[2]; x++) {
        const i = (y * W + x) * 4;
        tot++;
        if (data[i + 3] > 128) { r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++; }
        else if (data[i + 3] < 20) trans++;
      }
  }
  console.log(
    `${name}: opaque=${op} semi=${semi}` +
      (box
        ? ` | box[${box}]: opaque=${n}/${tot} trans=${trans} avgRGB=${n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : '-'}`
        : ''),
  );
}

// 男:病灶件
await full('male', ['male__hair__gray-short', 'male__mouth__laugh'], 'probe-gray-laugh.jpg');
await full('male', ['male__hair__slicked', 'male__beard__goatee', 'male__clothes__hoodie-gray'], 'probe-slicked.jpg');
await full('male', ['male__clothes__white-shirt', 'male__hair__slicked', 'male__glasses__square-black'], 'probe-shirt.jpg');
await full('male', ['male__eyes__closed', 'male__hair__spiky', 'male__clothes__workwear'], 'probe-closed.jpg');
// 女:丝巾 × 深色衣
await full('female', ['female__accessory__red-scarf', 'female__clothes__suit'], 'probe-scarf-suit.jpg');
await full('female', ['female__accessory__red-scarf', 'female__clothes__workwear'], 'probe-scarf-work.jpg');

// 数值采样:用户图3 肤斑区(1024 坐标约 x300-400,y150-260 附近属发区)
await inspect('male__hair__gray-short', [280, 120, 430, 280]);
await inspect('male__hair__slicked', [280, 120, 430, 280]);
await inspect('female__accessory__red-scarf');
