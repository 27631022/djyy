import { api } from "@/shared/api/client";

/**
 * 与后端 src/site-setting/site-setting.constants.ts 对齐的类型。
 * 任何字段变化两边都要同步。
 */
export interface FriendLink {
  label: string;
  url: string;
}

export interface SiteSettingsData {
  brand: {
    title: string;
    subtitle: string;
    logoUrl: string;
  };
  hero: {
    mainSlogan: string;
    subSlogan: string;
    bannerLineEn: string;
  };
  footer: {
    icp: string;
    copyright: string;
    friendLinks: FriendLink[];
  };
  theme: {
    primary: string;
    accent: string;
  };
}

/** 前台 NavPage 在 brand 字段缺失时显示的兜底,避免初次加载白屏 */
export const FALLBACK_SITE_SETTINGS: SiteSettingsData = {
  brand: {
    title: "党建益友",
    subtitle: "PARTY BUILDING DIGITAL PORTAL",
    logoUrl: "",
  },
  hero: {
    mainSlogan: "不忘初心,牢记使命",
    subSlogan: "凝聚党员力量 · 服务党务工作 · 推进党建高质量发展",
    bannerLineEn: "Party Building Digital Portal",
  },
  footer: {
    icp: "京ICP备XXXXXXXX号",
    copyright: "© 2025 党建益友门户 · 服务于党员与党务工作者 · 弘扬党建文化 · 凝聚奋进力量",
    friendLinks: [
      { label: "中央党校网", url: "#" },
      { label: "求是网", url: "#" },
      { label: "人民网党建频道", url: "#" },
      { label: "中国共产党新闻网", url: "#" },
      { label: "共产党员网", url: "#" },
      { label: "学习强国", url: "#" },
    ],
  },
  theme: {
    primary: "#C8001E",
    accent: "#F5A623",
  },
};

export const siteSettingApi = {
  /** 公开接口,无需 token */
  get: () => api.get<SiteSettingsData>("/site-settings").then((r) => r.data),

  /** 需要登录 */
  update: (data: SiteSettingsData) =>
    api.put<SiteSettingsData>("/site-settings", data).then((r) => r.data),
};
