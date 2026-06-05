/**
 * 站点设置数据结构 + 默认值
 *
 * 数据库 SiteSetting.data 字段存的就是这个对象的 JSON 字符串。
 * 前端可以从 GET /site-settings 直接拿到强类型对象。
 *
 * 新加字段时:
 *   1. 在 SiteSettingsData 加字段 + 类型
 *   2. 在 DEFAULT_SITE_SETTINGS 加默认值
 *   3. 前端 src/api/site-setting.ts 同步类型(或直接 import 这里的 type)
 */

export interface FriendLink {
  label: string;
  url: string;
}

export interface TopNavLink {
  /** 链接文字,如 "党务公开"。前端首页顶端 nav 用此字段 */
  label: string;
  /** 点击跳转的 URL,留 "#" 表示暂未启用(占位) */
  url: string;
}

export interface SiteSettingsData {
  brand: {
    /** 站点中文标题,如 "党建益友" */
    title: string;
    /** 英文副标题,如 "PARTY BUILDING DIGITAL PORTAL" */
    subtitle: string;
    /** LOGO 图片 URL,留空则使用内联 SVG 党徽 */
    logoUrl: string;
  };
  hero: {
    /** Hero 主标语,如 "不忘初心,牢记使命" */
    mainSlogan: string;
    /** Hero 副标语,如 "凝聚党员力量 · 服务党务工作 ..." */
    subSlogan: string;
    /** Hero 上方英文小字,如 "Party Building Digital Portal" */
    bannerLineEn: string;
  };
  footer: {
    /** ICP 备案号,如 "京ICP备XXXXXXXX号" */
    icp: string;
    /** 版权声明文字 */
    copyright: string;
    /** 友情链接(数组) */
    friendLinks: FriendLink[];
  };
  /** 首页顶端导航条 — 顶部 logo 右侧的 5-N 个文字链接(如 "首页 / 党务公开 / 学习园地 ...")*/
  topNav: {
    items: TopNavLink[];
  };
  theme: {
    /** 主色调(党建红),如 "#C8001E" */
    primary: string;
    /** 强调色(金黄),如 "#F5A623" */
    accent: string;
  };
}

/** 数据库初始化时写入的默认配置,与 NavPage 现有硬编码值保持一致 */
export const DEFAULT_SITE_SETTINGS: SiteSettingsData = {
  brand: {
    title: '党建益友',
    subtitle: 'PARTY BUILDING DIGITAL PORTAL',
    logoUrl: '/logo.svg',
  },
  hero: {
    mainSlogan: '不忘初心,牢记使命',
    subSlogan: '凝聚党员力量 · 服务党务工作 · 推进党建高质量发展',
    bannerLineEn: 'Party Building Digital Portal',
  },
  footer: {
    icp: '京ICP备XXXXXXXX号',
    copyright: '© 2025 党建益友门户 · 服务于党员与党务工作者 · 弘扬党建文化 · 凝聚奋进力量',
    friendLinks: [
      { label: '中央党校网', url: '#' },
      { label: '求是网', url: '#' },
      { label: '人民网党建频道', url: '#' },
      { label: '中国共产党新闻网', url: '#' },
      { label: '共产党员网', url: '#' },
      { label: '学习强国', url: '#' },
    ],
  },
  topNav: {
    items: [
      { label: '首页', url: '/' },
      { label: '党务公开', url: '#' },
      { label: '学习园地', url: '#' },
      { label: '通知公告', url: '#' },
      { label: '联系我们', url: '#' },
    ],
  },
  theme: {
    primary: '#C8001E',
    accent: '#F5A623',
  },
};

/** 单例行的固定 id */
export const SITE_SETTING_ID = 'default';
