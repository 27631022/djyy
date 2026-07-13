import { api } from "@/shared/api/client";

/**
 * 与后端 src/site-setting/site-setting.constants.ts 对齐的类型。
 * 任何字段变化两边都要同步。
 */
export interface FriendLink {
  label: string;
  url: string;
}

/** 首页顶端导航条的单条链接 — 显示在头部 logo 右侧 */
export interface TopNavLink {
  label: string;
  /** "#" 表示占位、暂未启用 */
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
  topNav: {
    items: TopNavLink[];
  };
  theme: {
    primary: string;
    accent: string;
  };
  /** 门户首页板块控制 */
  portal: {
    /** 首页「考核排行榜」显示哪张考核表(schemeId);空 = 自动取最新轮次。在考核表列表页「设为首页榜单」维护。 */
    assessmentSchemeId: string;
  };
}

/** 前台 NavPage 在 brand 字段缺失时显示的兜底,避免初次加载白屏 */
export const FALLBACK_SITE_SETTINGS: SiteSettingsData = {
  brand: {
    title: "党建益友",
    subtitle: "PARTY BUILDING DIGITAL PORTAL",
    logoUrl: "/logo.svg",
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
  topNav: {
    items: [
      { label: "首页", url: "/" },
      { label: "通讯录", url: "/directory" },
      { label: "党务公开", url: "#" },
      { label: "学习园地", url: "#" },
      { label: "通知公告", url: "#" },
      { label: "联系我们", url: "#" },
    ],
  },
  theme: {
    primary: "#C8001E",
    accent: "#F5A623",
  },
  portal: {
    assessmentSchemeId: "",
  },
};

export const siteSettingApi = {
  /** 公开接口,无需 token */
  get: () => api.get<SiteSettingsData>("/site-settings").then((r) => r.data),

  /** 需要登录 */
  update: (data: SiteSettingsData) =>
    api.put<SiteSettingsData>("/site-settings", data).then((r) => r.data),
};
