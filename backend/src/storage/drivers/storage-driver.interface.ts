import type { Readable } from 'node:stream';

/**
 * 存储驱动统一契约。
 *
 * 消费方(certificate / task …)只认 StorageService,不感知后端是本地盘 / 群晖 / 对象存储。
 * 切换后端 = 换一个 driver 实现 + 改一个 env 变量,业务代码零改动。
 *
 * `key` = driver 内相对路径,统一用 '/' 分隔(posix 风格),如
 * `certificate/2025-先进工作者/先进工作者-张三-1001.pdf`。
 */
export interface StorageDriver {
  readonly name: 'local' | 'synology' | 's3';
  /** 写入字节(含自动创建多级父目录) */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** 读取为流 —— 下载 / 公开页代理用。range 给定时只读该字节区间(HTTP Range / 视频拖动) */
  getStream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  /** 读取为 Buffer —— 批量打包 ZIP 用 */
  getBuffer(key: string): Promise<Buffer>;
  /** 删除真实字节(找不到视为成功,幂等) */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** DI token —— StorageModule 按 env 选定具体 driver 注入到 StorageService */
export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
