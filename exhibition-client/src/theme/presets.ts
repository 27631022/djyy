import { Color3 } from '@babylonjs/core';
import type { HallTheme } from '../types';

/**
 * 主题预设 —— 「美观大气」的参数表。
 * 每套 = 墙/地/吊顶/格栅/灯带/踢脚线/点缀 配色 + 光照强度;
 * Hall.meta.theme.preset 选套,theme.accent 可单独覆盖点缀色。
 */
export interface ThemeParams {
  name: string;
  clearColor: Color3; // 视口底色(墙外露出时)
  wall: Color3;
  wallRoughness: number;
  floor: Color3;
  floorRoughness: number; // 低粗糙度=反光地板(吃 IBL 反射)
  ceiling: Color3;
  beam: Color3; // 吊顶格栅梁
  stripEmissive: Color3; // 吊顶灯带自发光(GlowLayer 拾取)
  trim: Color3; // 踢脚线 / 顶角线
  accent: Color3; // 点缀色(LOGO/标语/光锥/门框)
  hemiIntensity: number;
  envIntensity: number;
  glowIntensity: number;
  spotIntensity: number; // 展品射灯
}

const PRESETS: Record<string, ThemeParams> = {
  // 现代展馆·浅色(默认):白墙 + 浅暖灰反光地面 + 发光格栅吊顶,党建红点缀
  modern_light: {
    name: '现代展馆·浅色',
    clearColor: Color3.FromHexString('#BFBDB8'),
    wall: Color3.FromHexString('#F5F3EF'),
    wallRoughness: 0.85,
    floor: Color3.FromHexString('#D8D5D0'),
    floorRoughness: 0.16,
    ceiling: Color3.FromHexString('#FAFAF8'),
    beam: Color3.FromHexString('#E9E7E2'),
    stripEmissive: new Color3(1.0, 0.96, 0.88),
    trim: Color3.FromHexString('#B9B5AE'),
    accent: Color3.FromHexString('#C8001E'),
    hemiIntensity: 0.55,
    envIntensity: 0.9,
    glowIntensity: 0.45,
    spotIntensity: 10,
  },
  // 党建红馆:红主题墙 + 深暖地面 + 金色点缀
  party_red: {
    name: '党建红馆',
    clearColor: Color3.FromHexString('#3A1216'),
    wall: Color3.FromHexString('#9C2630'),
    wallRoughness: 0.8,
    floor: Color3.FromHexString('#403B39'),
    floorRoughness: 0.12,
    ceiling: Color3.FromHexString('#2E2A28'),
    beam: Color3.FromHexString('#4A423E'),
    stripEmissive: new Color3(1.0, 0.85, 0.55),
    trim: Color3.FromHexString('#8C7A4D'),
    accent: Color3.FromHexString('#F5A623'),
    hemiIntensity: 0.42,
    envIntensity: 0.7,
    glowIntensity: 0.65,
    spotIntensity: 14,
  },
  // 深色科技馆:深灰蓝墙 + 强反射地面 + 冷光灯带
  dark_tech: {
    name: '深色科技馆',
    clearColor: Color3.FromHexString('#101216'),
    wall: Color3.FromHexString('#23262B'),
    wallRoughness: 0.75,
    floor: Color3.FromHexString('#1C1E22'),
    floorRoughness: 0.08,
    ceiling: Color3.FromHexString('#1A1C20'),
    beam: Color3.FromHexString('#2E3238'),
    stripEmissive: new Color3(0.45, 0.75, 1.0),
    trim: Color3.FromHexString('#3A3F47'),
    accent: Color3.FromHexString('#2D8CFF'),
    hemiIntensity: 0.3,
    envIntensity: 0.55,
    glowIntensity: 0.85,
    spotIntensity: 16,
  },
};

/** preset + accent 覆盖 → 最终参数(克隆,不污染预设表) */
export function resolveTheme(theme?: HallTheme): ThemeParams {
  const base = PRESETS[theme?.preset ?? 'modern_light'] ?? PRESETS.modern_light;
  const t: ThemeParams = { ...base };
  if (theme?.accent) {
    try {
      t.accent = Color3.FromHexString(theme.accent);
    } catch {
      /* 非法色值忽略,用预设 accent */
    }
  }
  return t;
}
