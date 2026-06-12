import { useEffect, useRef, useState } from "react";
import { renderStateToCanvas } from "../../lib/certificatePdf";
import type { DesignerState } from "../../lib/designerTypes";

interface PreviewCanvasProps {
  state: DesignerState;
  variableValues: Record<string, string>;
  /** 外部容器宽度上限,Canvas 会按比例适配 */
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * 非交互预览画布:仅按比例显示渲染结果。
 * 不带选择/handle 等编辑能力 —— 那些在 CanvasStage 里。
 *
 * 实现:每次 state 或变量值变化,异步预加载 image / qr / 党徽 → renderAll(isPreview=true)。
 */
export function PreviewCanvas({
  state,
  variableValues,
  maxWidth = 800,
  maxHeight = 600,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  // 监听 state 或值的稳定字符串变化触发重渲染(避免 useEffect 依赖里放整个 object 引发 churn)
  const stateKey = JSON.stringify({ s: state, v: variableValues });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        // 屏幕预览按高分屏倍率超采样(封顶 ×3),避免 Retina / 系统缩放下发糊
        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
        await renderStateToCanvas(canvas, state, variableValues, dpr);
        if (!cancelled) setRenderTick((t) => t + 1);
      } catch (e) {
        // 预览渲染失败不打断流程
        console.error("preview render failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  // 按比例缩放显示
  const ratio = Math.min(
    maxWidth / state.canvasWidth,
    maxHeight / state.canvasHeight,
    1,
  );
  const displayW = Math.round(state.canvasWidth * ratio);
  const displayH = Math.round(state.canvasHeight * ratio);

  return (
    <div
      className="bg-[#F4F5F8] rounded-lg flex items-center justify-center overflow-hidden"
      style={{ minHeight: displayH }}
      data-render-tick={renderTick}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: displayW,
          height: displayH,
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          background: "#FFFFFF",
        }}
      />
    </div>
  );
}
