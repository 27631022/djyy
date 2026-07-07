import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 常见问题答疑单条(AI 生成或人工编辑;service 层再归一化去空/限量)。
 * clicks(点击热度)由服务端按 id 保留/递增,**不接受客户端提交**(防伪造热度)。
 */
export class FaqItemDto {
  /** 稳定 id(编辑回传以保留点击数;新条目留空,服务端分配) */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  id?: string;

  @IsString()
  @MaxLength(300)
  q!: string;

  @IsString()
  @MaxLength(3000)
  a!: string;

  /** 人工置顶(排在自动热度之上) */
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
