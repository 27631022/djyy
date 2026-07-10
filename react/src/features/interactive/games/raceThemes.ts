import fieldTop from "./assets/soccer/field-top.jpg";
import fieldBottom from "./assets/soccer/field-bottom.png";
import podiumImg from "./assets/soccer/podium.png";
import frameImg from "./assets/soccer/frame.png";
import remoteBgImg from "./assets/soccer/remote-bg.png";
import athlete1 from "./assets/soccer/athlete1.png";
import athlete2 from "./assets/soccer/athlete2.png";
import athlete3 from "./assets/soccer/athlete3.png";

/** 领奖台图片上 3 个相框洞位 + 名牌位置(% of podium 容器)*/
export interface FramePos {
  av: { left: string; top: string; size: string };
  nm: { left: string; top: string };
}

/**
 * 赛跑主题 —— 一套可切换的视觉皮肤。图片资产可选(缺省用 CSS 兜底),故图片主题与 CSS 主题共用同一渲染器。
 * 加新主题 = 此处 RACE_THEMES 加一行(纯视觉);后端 race.game THEMES 白名单同步加键即可。
 */
export interface RaceTheme {
  key: string;
  label: string;
  backdrop?: string; // 滚动看台图(缺省用 backdropStyle)
  backdropStyle?: string; // CSS 背景(重复图案,可横向滚动)
  track?: string; // 赛道图(缺省用 trackStyle)
  trackStyle?: string;
  sprites?: string[]; // 跑者精灵图(缺省用 runnerEmoji)
  runnerEmoji?: string;
  podium?: string; // 领奖台图(配 frames);缺省走 CSS 领奖台
  frames?: FramePos[];
  frameOverlay?: string; // 报名页装饰框(透明中心;缺省用 CSS 边框)
  remoteBg?: string; // 手机端(遥控/参与页)背景图(缺省用手机默认渐变)
  accent: string; // 点缀色(终点线 / 倒计时)
  scrollSec: number; // 看台滚动一轮秒数
}

// 头像藏进金/红/蓝圆圈洞、名字落彩色名牌上。默认值 = 用户现场调校后定稿(取「666666」活动),
// 与 raceFrameEditor DEFAULT_NUM_FRAMES 保持同步(ax/ay/as/nx/ny → left/top/size)。
const SOCCER_FRAMES: FramePos[] = [
  { av: { left: "49.46%", top: "32.04%", size: "23.5%" }, nm: { left: "50%", top: "53.02%" } },
  { av: { left: "20.33%", top: "49.66%", size: "16%" }, nm: { left: "20%", top: "63.5%" } },
  { av: { left: "80.43%", top: "51.83%", size: "18.5%" }, nm: { left: "80.43%", top: "66.28%" } },
];

export const RACE_THEMES: Record<string, RaceTheme> = {
  soccer: {
    key: "soccer",
    label: "足球",
    backdrop: fieldTop,
    track: fieldBottom,
    sprites: [athlete1, athlete2, athlete3],
    podium: podiumImg,
    frames: SOCCER_FRAMES,
    frameOverlay: frameImg,
    remoteBg: remoteBgImg, // 用户提供的竖版球场手机图(750×1468)
    accent: "#22B573",
    scrollSec: 40,
  },
  neon: {
    key: "neon",
    label: "霓虹跑道",
    // 深底 + 每 60px 一道霓虹光柱,横向滚动(period 60、位移 -600=10 周期,无缝)
    backdropStyle:
      "repeating-linear-gradient(90deg, #05060f 0 40px, #0b1740 40px 44px, #05060f 44px 60px)",
    trackStyle: "repeating-linear-gradient(180deg, #0a1030 0 9%, #10184a 9% 18%)",
    runnerEmoji: "🏃",
    accent: "#00D4FF",
    scrollSec: 22,
  },
};

export const RACE_THEME_LIST: RaceTheme[] = Object.values(RACE_THEMES);
export function getRaceTheme(key: string | undefined): RaceTheme {
  return (key && RACE_THEMES[key]) || RACE_THEMES.soccer;
}
