/** 数据源 / 计分工具的「应用场景 + 使用案例」—— LeafConfigPanel 的 ⓘ 说明用。集中维护,不污染注册表定义。 */

export interface HelpText {
  scenario: string;
  example: string;
}

export const SCORING_HELP: Record<string, HelpText> = {
  manual: {
    scenario: "主观评价 / 看材料台账打分的指标(无法自动量化,由考核人按标准评判)。",
    example: "「政治铸魂」考核人查阅中心组学习台账,满分 2 分,记录完整给满分、缺项酌情扣,直接录入 1.5。",
  },
  proportional: {
    scenario: "有明确目标值、完成度可量化、按完成比例给分的指标。",
    example: "利润目标 1200 万、实际 1080 万 → 完成率 90% → 满分 6 分 × 90% = 5.4 分。",
  },
  overachieve_tiers: {
    scenario: "鼓励超额完成:设「完成 100% 得分」(可低于满分),超额按档累加,**总分封顶 = 本项分值**(不能超)。",
    example: "本项分值 3 分:完成 100% 给 1 分、超 20% 累加 +1、再超 50% 再 +1 = 3 分(封顶,不超本项分值)。",
  },
  threshold_tiers: {
    scenario: "按达标档次给分(分段计分),常用于满意率、合格率等。",
    example: "满意率 ≥95% 给满分、90–95% 给 8 分、80–90% 给 6 分、<80% 给 0 分。",
  },
  binary: {
    scenario: "只有「做了 / 没做」两种状态的指标。",
    example: "是否按期完成换届:完成给 2 分,未完成 0 分。",
  },
  rank_tiers: {
    scenario: "把所有考核对象横向比、按名次分档给分(需要全体对象数据)。",
    example: "各单位宣传稿件数排名:第 1 名给满分、前 3 名给 3 分、其余 0 分。",
  },
  rank_linear: {
    scenario: "按名次平滑赋分、不卡档(第 1 名满分,逐名递减),需要全体对象数据。",
    example: "36 家单位某指标排名,第 1 名 6 分、第 18 名约 3 分、末名约 0.17 分。",
  },
  minmax: {
    scenario: "把一组数值拉成相对分、消除量纲差异(最高者满分、最低者保底),需要全体对象数据。",
    example: "各单位人均培训学时:最高者满分、最低者 0 分(或保底分)、中间线性。",
  },
  bonus: {
    scenario: "加分项:荣誉、超额贡献等,按项累加、设上限。",
    example: "荣誉积分:国家级每项 +3、省部级 +2、公司级 +1,累计封顶 5 分。",
  },
  deduction: {
    scenario: "减分项:问题、事故、违纪等,按项累扣、设上限。",
    example: "一般不良影响每项扣 5/10 分,累计封顶 10 分。",
  },
};

export const DATA_SOURCE_HELP: Record<string, HelpText> = {
  dept_fill: {
    scenario: "责任部门(机关部门)直接掌握情况、人工录入数值或分数;可附佐证材料。",
    example: "党委组织部录「是否完成换届」、纪委办录「受处分人数」、考核人按标准录主观分。",
  },
  target: {
    scenario: "有年度目标值的量化指标:设目标 + 录实际,系统自动算完成率。",
    example: "财务部设利润目标 1200 万,录入实际 1080 万 → 自动得完成率 90%。",
  },
  self_report: {
    scenario: "被考核单位自己最清楚、需要上传台账/记录佐证的指标(自评 + 复核,填报 P2)。",
    example: "各支部自评「三会一课」开展情况并上传记录照片,责任部门/考核办复核。",
  },
  "business.task.completionRate": {
    scenario: "日常通过任务派发系统落实的工作,系统自动统计完成率(P2 接入)。",
    example: "党建督办任务派发后,系统统计某单位按期完成率,直接喂完成率比例计分。",
  },
  "business.task.overdueRate": {
    scenario: "任务落实的逾期比例,系统自动统计(P2 接入)。",
    example: "某单位督办任务逾期率 5% → 反向计分或扣分。",
  },
  "business.publicity": {
    scenario: "宣传类指标,从宣传/稿件系统自动统计数量(对应模块就绪后接)。",
    example: "各单位宣传稿件数 → 喂排名阶梯,按发稿量排名给分。",
  },
  "business.certificate.honor": {
    scenario: "荣誉表彰,从证书系统按级别自动积分(P2 接入)。",
    example: "某单位获省部级荣誉 1 项、公司级 2 项 → 自动积分 2+2=4,喂加分工具。",
  },
  survey: {
    scenario: "民主测评 / 群众满意度,投票或打分汇总成满意率(采集 P4)。",
    example: "年度党支部民主测评满意率 92% → 喂阶梯赋分得相应分。",
  },
  "assessment.result": {
    scenario: "把一个考核的结果当作另一个考核的指标输入(跨路线组合)。",
    example: "党建考核总分作为业绩考核「党建工作评价」指标(占业绩 20%)的输入。",
  },
};
