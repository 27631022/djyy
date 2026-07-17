import { useMemo } from "react";
import type { DocFormatConfig, FontRole, PageMetrics, PreviewPage } from "../api";

/**
 * 公文版面预览:按「每行 N 字 × 每页 M 行」的网格 1:1 画出来。
 *
 * **行是服务端断好的**(pages 里就是逐行文本),前端只负责把字摆进格子 ——
 * 这样预览与孤字告警同源,也绕开了「浏览器避头尾是下推、Word 是标点压缩」的老分歧。
 *
 * 仍然只是**示意**:字体度量、标点压缩这些最终由 Word/WPS 说了算。页面上有明示。
 */

/** 字体角色 → CSS font-family。方正装不上时按中易系兜底,别掉到宋体一种字体全篇同款 */
const FALLBACK: Record<FontRole, string> = {
  title: '"方正小标宋_GBK", "小标宋简体", "SimSun", serif',
  heading: '"方正黑体_GBK", "SimHei", "黑体", sans-serif',
  subheading: '"方正楷体_GBK", "KaiTi", "楷体", serif',
  body: '"方正仿宋_GBK", "FangSong", "仿宋", serif',
  pageNumber: '"SimSun", "宋体", serif',
};

function familyOf(cfg: DocFormatConfig, role: FontRole): string {
  return `"${cfg.fonts[role]}", ${FALLBACK[role]}`;
}

export function GridPreview({
  pages,
  config,
  metrics,
  zoom = 1,
}: {
  pages: PreviewPage[];
  config: DocFormatConfig;
  metrics: PageMetrics;
  zoom?: number;
}) {
  const PT = 96 / 72; // 1 磅 = 1.333 css px
  const s = PT * zoom;

  const geo = useMemo(() => {
    const { page, grid } = config;
    const mm = (v: number) => (v / 25.4) * 72; // mm → 磅
    return {
      pageW: mm(page.widthMm) * s,
      pageH: mm(page.heightMm) * s,
      padT: mm(page.marginTopMm) * s,
      padL: mm(page.marginLeftMm) * s,
      padR: mm(page.marginRightMm) * s,
      textW: metrics.textWidthPt * s,
      lineH: grid.lineSpacingPt * s,
      pitch: metrics.charPitchPt * s,
      footerBottom: mm(config.pageNumber.fromBottomMm) * s,
    };
  }, [config, metrics, s]);

  return (
    <div className="flex flex-col items-center gap-6">
      {pages.map((pg) => (
        <div
          key={pg.pageNo}
          className="relative shrink-0 bg-white shadow-lg ring-1 ring-slate-200"
          style={{ width: geo.pageW, height: geo.pageH }}
        >
          {/* 版心边界(浅色辅助线,只是让人看清页边距) */}
          <div
            className="pointer-events-none absolute border border-dashed border-slate-200"
            style={{
              left: geo.padL,
              top: geo.padT,
              width: geo.textW,
              height: metrics.linesPerPage * geo.lineH,
            }}
          />
          <div style={{ paddingLeft: geo.padL, paddingRight: geo.padR, paddingTop: geo.padT }}>
            {pg.lines.map((ln, i) => {
              const style = config.elements[ln.type];
              const fontPx = style.sizePt * s;
              // letter-spacing 在每个字后加空隙,N 个字正好铺满版心宽 = N × (字号 + 字距)。
              // 二号标题这类「字号 > 字符跨度」的会得到负字距 —— 那是对的(Word 也这么排),
              // 但 CSS 负字距会让字形挨得比字面框还近。标题是居中的、不吃版心宽,所以夹到 0。
              const rawGap = metrics.charPitchPt - style.sizePt;
              const gap = style.align === "center" ? Math.max(0, rawGap) : rawGap;
              const indent = ln.indentCells * geo.pitch;
              const rightIndent = ((style.rightIndentChars ?? 0) / 100) * geo.pitch;
              return (
                <div
                  key={i}
                  style={{
                    height: geo.lineH,
                    lineHeight: `${geo.lineH}px`,
                    fontSize: fontPx,
                    fontWeight: style.bold ? 700 : 400,
                    letterSpacing: `${gap * s}px`,
                    textAlign: style.align === "justify" ? "left" : style.align,
                    paddingLeft: style.align === "left" || style.align === "justify" ? indent : 0,
                    paddingRight: rightIndent,
                    whiteSpace: "pre",
                    wordBreak: "normal",
                  }}
                >
                  {/*
                    按「截」画而不是整行套一个字体 —— 一行可以跨多个字体角色:
                    「第一条  为深入贯彻…」的首行同时含黑体序号和仿宋正文。
                    整行套 elements[type].font 会把整段画成序号的黑体,与产物矛盾,
                    而确认页是这个产品唯一的质量闸门,不能对它撒谎。
                  */}
                  {ln.segs.map((sg, j) => (
                    <span
                      key={j}
                      style={{
                        fontFamily: familyOf(config, sg.role ?? (ln.type === "skip" ? "body" : style.font)),
                      }}
                    >
                      {sg.text}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
          {/* 页码 */}
          {config.pageNumber.enabled && (
            <div
              className="absolute"
              style={{
                bottom: geo.footerBottom,
                left: geo.padL,
                right: geo.padR,
                fontFamily: familyOf(config, config.pageNumber.font),
                fontSize: config.pageNumber.sizePt * s,
                textAlign: pg.pageNo % 2 === 1 ? config.pageNumber.oddAlign : config.pageNumber.evenAlign,
              }}
            >
              {config.pageNumber.dash} {pg.pageNo} {config.pageNumber.dash}
            </div>
          )}
          <div className="absolute -bottom-5 left-0 text-xs text-slate-400">第 {pg.pageNo} 页</div>
        </div>
      ))}
    </div>
  );
}
