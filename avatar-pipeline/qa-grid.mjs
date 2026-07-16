// QA 探针:把部件按 z 序合成到基准上,拼成带标签的网格图供视检。
// 用法: node qa-grid.mjs <male|female> <out.jpg> [组合清单编号]
import { createRequire } from 'node:module';
const sharp = createRequire('file:///D:/web/djyy/backend/package.json')('sharp');
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ASSETS = path.resolve('../react/src/features/avatar/studio/packs/pixar/assets');
const Z = { clothes: 10, mouth: 15, nose: 16, eyes: 17, brows: 18, beard: 20, accessory: 28, hair: 30, glasses: 40 };
const gender = process.argv[2] || 'female';
const out = process.argv[3] || `qa-${gender}.jpg`;
const mode = process.argv[4] || 'singles';

const files = readdirSync(ASSETS).filter((f) => f.startsWith(`${gender}__`) && f.endsWith('.webp'));
const parts = files.map((f) => {
  const [, slot, variant] = f.replace('.webp', '').split('__');
  return { slot, variant, file: path.join(ASSETS, f) };
});

function partOf(slot, variant) {
  const p = parts.find((x) => x.slot === slot && x.variant === variant);
  if (!p) throw new Error(`missing ${gender}/${slot}/${variant}`);
  return p;
}

async function compose(list, label) {
  const layers = [...list].sort((a, b) => Z[a.slot] - Z[b.slot]);
  const overlays = layers.map((l) => ({ input: l.file }));
  const buf = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#fff' } })
    .composite([{ input: path.join(ASSETS, `base-${gender}.webp`) }, ...overlays])
    .jpeg({ quality: 88 })
    .toBuffer();
  const small = await sharp(buf).resize(340, 340).toBuffer();
  const cap = Buffer.from(
    `<svg width="340" height="30"><rect width="340" height="30" fill="#222"/><text x="6" y="21" font-size="15" fill="#fff" font-family="sans-serif">${label}</text></svg>`,
  );
  return sharp({ create: { width: 340, height: 372, channels: 3, background: '#fff' } })
    .composite([{ input: small, top: 0, left: 0 }, { input: cap, top: 342, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// 组合清单
let combos = [];
if (mode === 'singles') {
  // 每个部件单独上基准(找部件自身病灶)
  combos = parts.map((p) => ({ label: `${p.slot}/${p.variant}`, list: [p] }));
} else if (mode === 'cross') {
  // 高危跨槽组合(合并后仍会出现的搭配)
  const hairs = parts.filter((p) => p.slot === 'hair');
  const acc = parts.filter((p) => p.slot === 'accessory');
  const glasses = parts.filter((p) => p.slot === 'glasses');
  const clothes = parts.filter((p) => p.slot === 'clothes');
  // 饰品 × 露耳/遮耳发型
  for (const a of acc)
    for (const h of hairs.slice(0, 6))
      combos.push({ label: `${a.variant}+${h.variant}`, list: [a, h] });
  // 眼镜 × 发型(镜腿压发)
  for (const g of glasses)
    for (const h of hairs.slice(0, 6))
      combos.push({ label: `${g.variant}+${h.variant}`, list: [g, h] });
  // 丝巾 × 各衣服
  const scarf = acc.find((a) => a.variant === 'red-scarf');
  if (scarf) for (const c of clothes) combos.push({ label: `scarf+${c.variant}`, list: [scarf, c] });
} else {
  // 自定义: JSON 文件 [[slot,variant],...] 数组的数组
  const spec = JSON.parse(readFileSync(mode, 'utf8'));
  combos = spec.map((entry) => ({
    label: entry.map((e) => e[1]).join('+'),
    list: entry.map((e) => partOf(e[0], e[1])),
  }));
}

const COLS = 4;
const tiles = [];
for (const c of combos) tiles.push(await compose(c.list, c.label));
const rows = Math.ceil(tiles.length / COLS);
const grid = await sharp({
  create: { width: COLS * 340, height: rows * 372, channels: 3, background: '#fff' },
})
  .composite(tiles.map((t, i) => ({ input: t, left: (i % COLS) * 340, top: Math.floor(i / COLS) * 372 })))
  .jpeg({ quality: 88 })
  .toFile(out);
console.log(`${out}: ${combos.length} combos, ${rows} rows`);
