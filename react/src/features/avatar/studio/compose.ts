import { HEX_COLOR, type AvatarStudioConfig, type StudioLayer, type StylePack } from "./types";

/**
 * 配置 → 渲染图层列表(z 升序;基准图恒为第 0 层)。
 * 预览与导出共用这一份解析,保证所见即所得。
 */
export function layersOf(pack: StylePack, cfg: AvatarStudioConfig): StudioLayer[] {
  const layers: StudioLayer[] = [{ slotKey: "__base__", src: pack.bases[cfg.gender], z: 0 }];
  for (const slot of pack.slots) {
    const id = cfg.picks[slot.key];
    if (!id) continue;
    const v = slot.variants.find((x) => x.id === id && x.gender === cfg.gender);
    if (v) layers.push({ slotKey: slot.key, src: v.src, z: v.z ?? slot.z });
  }
  return layers.sort((a, b) => a.z - b.z);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图层加载失败: ${src}`));
    img.src = src;
  });
}

/** 图层叠画到 canvas(导出/存库用;页内预览走 <img> 层叠不经 canvas)。bgColor 缺省 = 透明底 */
export async function renderToCanvas(
  layers: StudioLayer[],
  size: number,
  bgColor?: string | null,
): Promise<HTMLCanvasElement> {
  const imgs = await Promise.all(layers.map((l) => loadImage(l.src)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 不可用");
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
  }
  for (const img of imgs) ctx.drawImage(img, 0, 0, size, size);
  return canvas;
}

/** canvas → PNG Blob */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob 失败"))), "image/png");
  });
}

async function fetchDataUrl(src: string): Promise<string> {
  const res = await fetch(src);
  // fetch 对 404/500 也 resolve —— 不检查会把错误页静默编成 data:text/html 塞进 <image>,导出少图层无人知
  if (!res.ok) throw new Error(`图层获取失败(${res.status}): ${src}`);
  const blob = await res.blob();
  // MIME 白名单:blob.type 会拼进 data:URL 进 href 属性,quoted-string 参数可携带引号突破属性边界
  if (!/^image\/[a-z0-9.+-]+$/i.test(blob.type)) throw new Error(`图层非图片响应: ${src}`);
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("读取图层失败"));
    fr.readAsDataURL(blob);
  });
}

/**
 * 导出 SVG 文档字符串:图层内嵌为 data:URI 的 <image>(位图风格包的固有取舍 —— 合法 SVG、
 * 任意查看器可显,但非真矢量;矢量风格包落地后走同接口输出 path)。
 */
export async function buildSvg(layers: StudioLayer[], size: number, bgColor?: string | null): Promise<string> {
  const urls = await Promise.all(layers.map((l) => fetchDataUrl(l.src)));
  const bg = bgColor && HEX_COLOR.test(bgColor) ? `  <rect width="${size}" height="${size}" fill="${bgColor}"/>\n` : "";
  const images = urls
    .map((u) => `  <image href="${u}" x="0" y="0" width="${size}" height="${size}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n${bg}${images}\n</svg>\n`;
}
