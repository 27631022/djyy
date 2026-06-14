import { IsArray } from 'class-validator';

/** 批量录入指标原始值。每项 {targetRef, leafCode, rawValue?, note?};内层结构由 service 防御性解析。 */
export class SaveScoresDto {
  @IsArray()
  scores!: unknown[];
}
