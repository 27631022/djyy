import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as nodePath from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver.interface';

/**
 * 本地磁盘驱动。
 *
 * 也用于「挂载的群晖共享盘」—— 对 Node 而言挂载点就是个普通目录,同一份代码即可:
 * 把 STORAGE_LOCAL_DIR 指到挂载点(Linux `/mnt/synology/djyy`、Windows `\\NAS\djyy` UNC、
 * 或后端跑在群晖 Docker 上时的本地卷),文件即落成 File Station 里可浏览的真实目录。
 *
 * key 用 '/' 分隔,落盘时 path.join 自动转平台分隔符(Windows / Linux 都兼容)。
 */
export class LocalDiskDriver implements StorageDriver {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = nodePath.resolve(root);
  }

  /** key → 绝对路径,并防路径穿越(resolve 后必须仍在 root 下) */
  private resolveKey(key: string): string {
    const abs = nodePath.resolve(this.root, ...key.split('/').filter(Boolean));
    if (abs !== this.root && !abs.startsWith(this.root + nodePath.sep)) {
      throw new Error(`非法存储路径: ${key}`);
    }
    return abs;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const abs = this.resolveKey(key);
    await mkdir(nodePath.dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }

  async getStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    const abs = this.resolveKey(key);
    await access(abs); // 不存在 → 抛 ENOENT,由 StorageService 转 NotFound
    // range:只读字节区间(视频拖动 / HTTP Range);createReadStream 的 start/end 都是闭区间
    return createReadStream(abs, range ? { start: range.start, end: range.end } : undefined);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true }); // force: 不存在也不报错(幂等)
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}
