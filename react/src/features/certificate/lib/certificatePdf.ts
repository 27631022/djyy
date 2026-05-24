import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  PARTY_EMBLEM_CACHE_KEY,
  getQRCacheKey,
  renderAll,
} from "./canvasRenderer";
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

/**
 * 渲染 state 到指定 canvas(尺寸跟 state 一致),含预加载。
 * 用于:1) 发证页预览 2) PDF 生成
 */
export async function renderStateToCanvas(
  canvas: HTMLCanvasElement,
  state: DesignerState,
  variableValues: Record<string, string> = {},
): Promise<void> {
  canvas.width = state.canvasWidth;
  canvas.height = state.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取画布上下文");

  const stateWithValues: DesignerState = {
    ...state,
    variables: injectVariableValues(state.variables, variableValues),
  };

  const { bgImage, imageCache } = await preloadAssets(stateWithValues);
  renderAll(ctx, stateWithValues, { bgImage, imageCache, isPreview: true });
}

/** 生成证书 PDF 的 data URL(data:application/pdf;base64,...) */
export async function generateCertificatePdfDataUrl(
  state: DesignerState,
  variableValues: Record<string, string>,
): Promise<string> {
  const canvas = document.createElement("canvas");
  await renderStateToCanvas(canvas, state, variableValues);

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
  return pdf.output("datauristring");
}

/** 触发浏览器下载 — 把 data URL 包成 <a download> 点一下 */
export function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
