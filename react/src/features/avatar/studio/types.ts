/**
 * 头像编辑器引擎类型 —— 风格包(StylePack)双载体设计:
 * 当前落地 raster(位图图层,豆包生成的差分部件,全画布同坐标系零偏移直叠);
 * vector(SVG 字符串+哨兵色换色)留作后续风格包载体,契约同槽位模型。
 */

export type StudioGender = "male" | "female";

/** 一个部件变体(全画布对位图层) */
export interface StudioVariant {
  id: string;
  label: string;
  /** 变体归属性别(部件由各性别基准差分生成,不跨性别复用) */
  gender: StudioGender;
  /** 图层资源 URL(构建期静态导入的 webp) */
  src: string;
  /** 随机抽取权重(默认 1) */
  weight?: number;
}

/** 一个槽位(部件类目) */
export interface StudioSlot {
  key: string;
  label: string;
  /** 图层叠放顺序,大者在上(基准图恒为 0) */
  z: number;
  /** 允许"无"(光头/不戴眼镜);随机时按 noneWeight 抽中"无" */
  optional?: boolean;
  /** 随机抽中"无"的权重(相对各变体 weight;仅 optional 生效,默认 1) */
  noneWeight?: number;
  variants: StudioVariant[];
}

/** 风格包定义 */
export interface StylePack {
  id: string;
  label: string;
  /** 画布边长(部件全画布对位的坐标系) */
  canvas: number;
  /** 基准图(隐式 z=0 图层,按性别取) */
  bases: Record<StudioGender, string>;
  slots: StudioSlot[];
}

/** 头像配置 —— 持久化"最终选择结果"(素材池增删不影响已存头像的复现) */
export interface AvatarStudioConfig {
  packId: string;
  schemaVersion: number;
  gender: StudioGender;
  /** slotKey → variantId(null = 无) */
  picks: Record<string, string | null>;
  /** 背景色(hex;null/缺省 = 透明底) */
  bgColor?: string | null;
}

export const STUDIO_SCHEMA_VERSION = 1;

/** 合法背景色(3/4/6/8 位 hex)—— sanitize 与 SVG 导出共用同一口径 */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** 解析后的渲染图层(z 升序) */
export interface StudioLayer {
  slotKey: string;
  src: string;
  z: number;
}
