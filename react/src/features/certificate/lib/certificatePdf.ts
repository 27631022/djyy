import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  PARTY_EMBLEM_CACHE_KEY,
  getQRCacheKey,
  renderAll,
} from "./canvasRenderer";
import { generateThumbnail } from "./exportUtils";
import type { DesignerState, VariableField } from "./designerTypes";

/**
 * 浏览器侧把 DesignerState 渲染到 off-screen canvas → 生成 PDF base64 data URL。
 *
 * 与设计器的 CanvasStage 不同,这里没有交互,纯渲染:
 *   1. 把 user 提供的变量值注入到 variables[i].sampleValue
 *   2. 预加载 bg image / image 元素 / 二维码 / 党徽
 *   3. renderAll(isPreview=true) — {{label}} 占位符就被替换成实际值
 *   4. canvas.toDataURL → jspdf.addImage → output('datauristring')
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function preloadAssets(state: DesignerState): Promise<{
  bgImage: HTMLImageElement | null;
  imageCache: Map<string, HTMLImageElement>;
}> {
  let bgImage: HTMLImageElement | null = null;
  const imageCache = new Map<string, HTMLImageElement>();

  // 背景图
  if (state.background.type === "image" && state.background.imageUrl) {
    try {
      bgImage = await loadImage(state.background.imageUrl);
    } catch {
      bgImage = null;
    }
  }

  // 元素侧 asset
  const needEmblem = state.elements.some(
    (el) => el.type === "stamp" && el.centerPattern === "emblem",
  );
  const tasks: Promise<void>[] = [];

  if (needEmblem) {
    tasks.push(
      loadImage(PARTY_EMBLEM_CACHE_KEY)
        .then((img) => {
          imageCache.set(PARTY_EMBLEM_CACHE_KEY, img);
        })
        .catch(() => {}),
    );
  }

  for (const el of state.elements) {
    if (el.type === "image" && el.dataUrl) {
      const k = el.dataUrl;
      if (!imageCache.has(k)) {
        tasks.push(
          loadImage(k)
            .then((img) => {
              imageCache.set(k, img);
            })
            .catch(() => {}),
        );
      }
    }
    if (el.type === "qrcode" && el.content) {
      const k = getQRCacheKey(el);
      if (!imageCache.has(k)) {
        tasks.push(
          QRCode.toDataURL(el.content || " ", {
            color: { dark: el.color || "#000000", light: el.background || "#FFFFFF" },
            width: 256,
            margin: 1,
            errorCorrectionLevel: "M",
          })
            .then(async (dataUrl) => {
              const img = await loadImage(dataUrl);
              imageCache.set(k, img);
            })
            .catch(() => {}),
        );
      }
    }
  }

  await Promise.all(tasks);
  return { bgImage, imageCache };
}

/** 把变量实际值注入到 variables 数组的 sampleValue,renderAll 在 preview 模式下会用它替换占位符 */
function injectVariableValues(
  variables: VariableField[],
  values: Record<string, string>,
): VariableField[] {
  return variables.map((v) => {
    const userValue = values[v.key];
    if (userValue === undefined || userValue === null) return v;
    return { ...v, sampleValue: userValue };
  });
}

/** 发证 / 导出 PDF·PNG 的超采样倍率。设计像素 × 3 → 屏幕、截图、A4/A5 打印都够清晰 */
export const EXPORT_SCALE = 3;

/**
 * 渲染 state 到指定 canvas,含预加载。
 * 用于:1) 发证页预览 2) PDF/PNG 生成
 *
 * scale = 超采样倍率:backing store 放大到 设计尺寸 × scale,再用 ctx.setTransform(scale)
 * 让所有渲染代码继续用逻辑坐标 —— 这样画布像素更多 = 更清晰,渲染逻辑零改动。
 *   - 屏幕预览传 devicePixelRatio(高分屏不糊)
 *   - 导出/发证 PDF 传 EXPORT_SCALE(下载/打印清晰)
 */
export async function renderStateToCanvas(
  canvas: HTMLCanvasElement,
  state: DesignerState,
  variableValues: Record<string, string> = {},
  scale = 1,
): Promise<void> {
  const s = scale > 0 ? scale : 1;
  canvas.width = Math.round(state.canvasWidth * s);
  canvas.height = Math.round(state.canvasHeight * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取画布上下文");
  ctx.setTransform(s, 0, 0, s, 0, 0);

  const stateWithValues: DesignerState = {
    ...state,
    variables: injectVariableValues(state.variables, variableValues),
  };

  const { bgImage, imageCache } = await preloadAssets(stateWithValues);
  renderAll(ctx, stateWithValues, { bgImage, imageCache, isPreview: true });
}

/** 生成证书 PDF 的 data URL(data:application/pdf;base64,...)。图按 EXPORT_SCALE 超采样,页面仍用逻辑尺寸 → 高 DPI */
export async function generateCertificatePdfDataUrl(
  state: DesignerState,
  variableValues: Record<string, string>,
): Promise<string> {
  const canvas = document.createElement("canvas");
  await renderStateToCanvas(canvas, state, variableValues, EXPORT_SCALE);

  const imgData = canvas.toDataURL("image/png");
  const w = state.canvasWidth;
  const h = state.canvasHeight;
  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
  });
  // 页面尺寸是逻辑 w×h,但 imgData 是 ×EXPORT_SCALE 的高清图 → 嵌入后等效高 DPI
  pdf.addImage(imgData, "PNG", 0, 0, w, h);
  return pdf.output("datauristring");
}

/**
 * 一次渲染同时产出「高清 PDF」+「压缩预览缩略图」。
 *
 * 发证时用这个,而不是分别调两次渲染 —— 同一张 ×EXPORT_SCALE 的高清 canvas:
 *   - 直接出 PDF(高清,用于下载)
 *   - 降采样出 JPEG 缩略图(约几十 KB,存库供详情轻量预览)
 * 缩略图准确反映"发证当时"的样子(即使日后改了模板也不受影响)。
 */
export async function generateCertificateOutputs(
  state: DesignerState,
  variableValues: Record<string, string>,
  thumbWidth = 700,
  thumbQuality = 0.72,
): Promise<{ pdfData: string; thumbnail: string }> {
  const canvas = document.createElement("canvas");
  await renderStateToCanvas(canvas, state, variableValues, EXPORT_SCALE);

  const imgData = canvas.toDataURL("image/png");
  const w = state.canvasWidth;
  const h = state.canvasHeight;
  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(imgData, "PNG", 0, 0, w, h);
  const pdfData = pdf.output("datauristring");

  const thumbnail = generateThumbnail(canvas, thumbWidth, thumbQuality);
  return { pdfData, thumbnail };
}

/** 生成证书 PNG 的 data URL(高清,按 EXPORT_SCALE 超采样) */
export async function generateCertificatePngDataUrl(
  state: DesignerState,
  variableValues: Record<string, string> = {},
): Promise<string> {
  const canvas = document.createElement("canvas");
  await renderStateToCanvas(canvas, state, variableValues, EXPORT_SCALE);
  return canvas.toDataURL("image/png");
}

/**
 * data:<mime>[;params];base64,<data> → Blob。解析失败返回 null。
 * 兼容 jspdf 的 `data:application/pdf;filename=generated.pdf;base64,...` 这种带参数的形态。
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const meta = dataUrl.slice(5, comma); // 去掉前缀 "data:"
    const isBase64 = /;base64/i.test(meta);
    const mime = meta.split(";")[0] || "application/octet-stream";
    const dataPart = dataUrl.slice(comma + 1);
    if (isBase64) {
      const bin = atob(dataPart);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(dataPart)], { type: mime });
  } catch {
    return null;
  }
}

/**
 * 触发浏览器下载。
 *
 * data: URL 先转成 Blob + object URL 再下载 —— 因为大体积 data: URL(单张高清证书可达十几 MB)
 * 用 `<a href="data:...">` 直接下载会被 Chrome 等浏览器静默拦截(无报错、无文件)。
 * blob:/http(s): URL 原样使用(批量下载的 ZIP 已是 object URL)。
 */
export function triggerDownload(url: string, filename: string): void {
  let href = url;
  let objectUrl: string | null = null;
  if (url.startsWith("data:")) {
    const blob = dataUrlToBlob(url);
    if (blob) {
      objectUrl = URL.createObjectURL(blob);
      href = objectUrl;
    }
  }
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
