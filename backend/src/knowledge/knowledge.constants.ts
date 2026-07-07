/** 文章状态机:draft →(submit)→ pending|published →(review)→ published|rejected;published →(新版发布)→ archived */
export const ARTICLE_STATUS = ['draft', 'pending', 'published', 'rejected', 'archived'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUS)[number];

/** 文章来源 */
export const ARTICLE_SOURCES = ['manual', 'import', 'ai_archive'] as const;
export type ArticleSource = (typeof ARTICLE_SOURCES)[number];

/** reaction 类型 */
export const REACTION_TYPES = ['like', 'favorite'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

/** 同一用户同一文章,这个窗口内重复进入不重复 +viewCount(浏览日志仍每次一条) */
export const VIEW_DEDUP_MINUTES = 30;

/** 单次浏览时长上限(秒)= 4 小时,beacon 回填超出按此钳制 */
export const VIEW_DURATION_MAX_SEC = 14400;

/** 列表接口单页上限 */
export const LIST_PAGE_SIZE_MAX = 50;

/** 标签个数/长度上限(写入时归一化) */
export const TAG_MAX_COUNT = 12;
export const TAG_MAX_LEN = 24;

/**
 * 内容级别(文件来源级别)—— 固定小表,门户左侧筛选 + 编辑器勾选。
 * 顺序 = 由高到低的机构层级。要改名/增删就动这一处(前端 api.ts 有一份镜像常量需同步)。
 */
export const KNOWLEDGE_LEVELS = [
  { code: 'national', name: '中央国家' },
  { code: 'group', name: '集团公司' },
  { code: 'region', name: '自治区' },
  { code: 'company', name: '公司' },
  { code: 'branch', name: '分公司' },
] as const;

export const KNOWLEDGE_LEVEL_CODES: readonly string[] = KNOWLEDGE_LEVELS.map((l) => l.code);

/** 归一化级别:合法 code 原样返回,空/非法 → null */
export function normalizeLevel(level?: string | null): string | null {
  const v = (level ?? '').trim();
  return v && KNOWLEDGE_LEVEL_CODES.includes(v) ? v : null;
}

/**
 * 正文里 storage 图片/附件引用的提取正则 —— 匹配「/public/knowledge/files/<fileId>」
 * (前端存相对路径 /api/public/knowledge/files/<id>,渲染时再拼后端 origin)。
 * 用于:删文联动删文件、maintenance 孤儿 GC 的「在用集合」上报。
 */
export const CONTENT_FILE_REF_RE = /\/public\/knowledge\/files\/([a-zA-Z0-9]+)/g;

/** 正文内嵌图片/附件引用的相对路径(渲染时前端拼 origin)。导入改写引用时用。 */
export function knowledgeFileRefFromId(fileId: string): string {
  return `/api/public/knowledge/files/${fileId}`;
}
