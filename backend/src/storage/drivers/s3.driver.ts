import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver.interface';

/**
 * S3 / MinIO / 阿里 OSS 兼容驱动 —— 占位(尚未实现)。
 *
 * 当前规模用本地盘(可指向挂载的群晖)已够;需要对象存储 / 多实例水平扩展时再实现。
 * 落地建议:用 `@aws-sdk/client-s3`(`forcePathStyle:true` + 自定义 `endpoint` 一份代码吃
 * MinIO/OSS/COS/AWS),Put/Get/Delete/HeadObjectCommand;签名 URL 走 service 层统一签发。
 */
export class S3Driver implements StorageDriver {
  readonly name = 's3' as const;

  constructor() {
    throw new Error(
      'S3Driver 尚未实现。当前请用 STORAGE_DRIVER=local;需对象存储时按 plan 用 @aws-sdk/client-s3 实现。',
    );
  }

  async put(): Promise<void> {
    throw new Error('S3Driver 尚未实现');
  }
  async getStream(): Promise<Readable> {
    throw new Error('S3Driver 尚未实现');
  }
  async getBuffer(): Promise<Buffer> {
    throw new Error('S3Driver 尚未实现');
  }
  async delete(): Promise<void> {
    throw new Error('S3Driver 尚未实现');
  }
  async exists(): Promise<boolean> {
    throw new Error('S3Driver 尚未实现');
  }
}
