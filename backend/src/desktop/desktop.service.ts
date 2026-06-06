import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Readable } from 'stream';

/** desktop-dist/release.json 的形状(发版时手写/脚本生成)。 */
interface ReleaseMeta {
  version: string;
  /** 安装包文件名(与 .sig 同目录,如 DjyyDesktop_0.3.0_x64-setup.exe) */
  file: string;
  notes?: string;
  /** ISO 串;缺省取当前时间 */
  pubDate?: string;
}

/**
 * 桌面客户端发版:从「分发目录」读最新版本 + 安装包 + Tauri 更新签名,
 * 对客户端的 updater 提供清单(latest.json)+ 安装包下载。
 * 分发目录默认 backend/desktop-dist,可用环境变量 DESKTOP_DIST_DIR 覆盖。
 * 发版动作 = 把签名后的 setup.exe + 同名 .sig 丢进该目录 + 更新 release.json。
 */
@Injectable()
export class DesktopService {
  private distDir(): string {
    return process.env.DESKTOP_DIST_DIR || join(process.cwd(), 'desktop-dist');
  }

  private release(): ReleaseMeta {
    const p = join(this.distDir(), 'release.json');
    if (!existsSync(p)) throw new NotFoundException('暂无发布的桌面客户端版本');
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as ReleaseMeta;
    } catch {
      throw new NotFoundException('release.json 解析失败');
    }
  }

  /**
   * Tauri updater 清单。下载地址**动态**填成当前请求的服务器(host 含端口),
   * 以适配局域网 IP 变化 —— 客户端连哪台、就从哪台下载更新包。
   */
  getManifest(host: string) {
    const rel = this.release();
    const sigPath = join(this.distDir(), `${rel.file}.sig`);
    if (!existsSync(sigPath)) throw new NotFoundException('缺少更新签名文件(.sig)');
    const signature = readFileSync(sigPath, 'utf8').trim();
    return {
      version: rel.version,
      notes: rel.notes ?? '',
      pub_date: rel.pubDate ?? new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature,
          url: `http://${host}/api/desktop/download`,
        },
      },
    };
  }

  /** 最新安装包路径 + 文件名(下载用)。 */
  installer(): { path: string; name: string } {
    const rel = this.release();
    const path = join(this.distDir(), rel.file);
    if (!existsSync(path)) throw new NotFoundException('安装包文件缺失');
    return { path, name: rel.file };
  }

  stream(path: string): Readable {
    return createReadStream(path);
  }
}
