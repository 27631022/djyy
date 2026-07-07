/** 晒台状态机:draft →(submit)→ pending|published →(review)→ published|rejected;published ↔ closed */
export const STAGE_STATUS = ['draft', 'pending', 'published', 'rejected', 'closed'] as const;
export type StageStatus = (typeof STAGE_STATUS)[number];

/** 作品状态机:draft →(submit)→ pending|published →(review)→ published|rejected;published 被作者编辑 → pending */
export const ENTRY_STATUS = ['draft', 'pending', 'published', 'rejected'] as const;
export type EntryStatus = (typeof ENTRY_STATUS)[number];

/** 互动/浏览的多态目标:晒台 | 参晒作品 */
export const TARGET_TYPES = ['stage', 'entry'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

/** 台内排位依据:作品点赞数 | 作品申报数值 */
export const RANK_BY = ['likes', 'metric'] as const;
export type RankBy = (typeof RANK_BY)[number];

/** reaction 类型(当前仅点赞;留 type 列与 knowledge 对齐,将来可加 favorite) */
export const REACTION_TYPES = ['like'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

/** 同一用户同一对象,这个窗口内重复进入不重复 +viewCount(浏览日志仍每次一条) */
export const VIEW_DEDUP_MINUTES = 30;

/** 单次浏览时长上限(秒)= 4 小时,beacon 回填超出按此钳制 */
export const VIEW_DURATION_MAX_SEC = 14400;

/** 列表接口单页上限 */
export const LIST_PAGE_SIZE_MAX = 50;

/** 台头介绍区块数上限(轻量,重内容放作品) */
export const STAGE_INTRO_BLOCKS_MAX = 10;

/** 参晒作品区块数上限 */
export const ENTRY_BLOCKS_MAX = 30;
