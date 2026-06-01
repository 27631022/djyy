import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver.interface';

/**
 * 群晖 File Station API 驱动 —— 占位(尚未实现)。
 *
 * 当前推荐用法是把群晖共享盘「挂载」到后端机器,直接走 LocalDiskDriver(STORAGE_DRIVER=local),
 * 零额外代码。仅当后端无法挂载、需纯 HTTP 调群晖时才实现本驱动。
 *
 * 落地规格(认证拿 sid / 上传 create_parents 自动建多级文件夹 / 下载代理 / 错误码 119 重登)
 * 见 `~/.claude/plans/ai-swirling-bear.md` 附录(摘自 Synology File Station Official API)。
 *
 * 构造即抛错 —— 一旦误配 STORAGE_DRIVER=synology,启动时就明确失败,而非首次上传才崩。
 */
export class SynologyDriver implements StorageDriver {
  readonly name = 'synology' as const;

  constructor() {
    throw new Error(
      'SynologyDriver 尚未实现。请将 STORAGE_DRIVER 设为 local(挂载群晖共享盘即可),' +
        '或按 plan 附录用 File Station API 实现本驱动后再启用。',
    );
  }

  async put(): Promise<void> {
    throw new Error('SynologyDriver 尚未实现');
  }
  async getStream(): Promise<Readable> {
    throw new Error('SynologyDriver 尚未实现');
  }
  async getBuffer(): Promise<Buffer> {
    throw new Error('SynologyDriver 尚未实现');
  }
  async delete(): Promise<void> {
    throw new Error('SynologyDriver 尚未实现');
  }
  async exists(): Promise<boolean> {
    throw new Error('SynologyDriver 尚未实现');
  }
}
