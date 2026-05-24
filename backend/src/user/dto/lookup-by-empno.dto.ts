import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 批量按员工编号(= User.username)查 User。
 *
 * 发证页 Step 3b 用 —— 用户粘贴 N 行「姓名 + 员工号」,前端按行解析出
 * empNo 数组,一次 POST 拿回全部结果,避免 N 次单条 lookup。
 *
 * 上限 200 是发证场景的合理上限(单次表彰超过 200 人极少)。
 */
export class LookupByEmpNoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  empNos!: string[];
}

/** 单条返回 —— 命中则给摘要,未命中则 null */
export interface UserByEmpNoLite {
  id: string;
  username: string;
  name: string;
  /** 主行政归属名(取 isPrimary 优先,否则取第一个 active) */
  adminOrgName: string | null;
  /** 主党组织归属名 */
  partyOrgName: string | null;
}
