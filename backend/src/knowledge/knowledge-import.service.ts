import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { StorageService } from '../storage';
import { knowledgeFileRefFromId } from './knowledge.constants';
import { ImportExecuteDto } from './dto/import-execute.dto';

interface ActorCtx {
  actorId: string;
  actorName: string;
  ip?: string;
}

/** docsify 自身的空壳文件 —— 导入时一律跳过(用户的目录里 _sidebar.md 就是模板残留) */
const DOCSIFY_SKIP = new Set([
  '_sidebar.md',
  '_navbar.md',
  '_coverpage.md',
  'index.html',
  '.nojekyll',
  '_media',
]);

/** 分析结果里的单篇条目 */
export interface ImportItem {
  /** zip 内相对路径(execute 时回传,用于再定位) */
  path: string;
  title: string;
  /** 目录段(去掉文件名),供前端拼「根分类 + 子目录」两级分类 */
  dirSegments: string[];
  /** 正文内嵌图片/资产:zip 内能找到的 / 找不到的(缺失死链) */
  assetsFound: number;
  assetsMissing: number;
  /** 同标题已在库(默认 skip) */
  dup: boolean;
}

export interface ImportAnalysis {
  importFileId: string;
  items: ImportItem[];
  /** 检测到 _sidebar.md 但其引用文件都不在包内 → 已忽略(回退目录结构) */
  sidebarIgnored: boolean;
  skippedNonMd: number;
}

/** 单条目解压上限(防 zip bomb:高压缩比条目 async 会把整条解压进内存) */
const MD_MAX_BYTES = 20 * 1024 * 1024;
const ASSET_MAX_BYTES = 50 * 1024 * 1024;

/** 标题清理:去 markdown 强调符、HTML 标签(<br> 等)、链接语法,归一成纯文本 */
function cleanHeading(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .trim();
}

/** md 内相对图片/资产引用:![alt](path) 与 <img src="path"> */
const MD_IMG_RE = /!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g;
const HTML_IMG_RE = /<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

/**
 * 知识库存量 MD 批量导入(P2)。两步式:
 *   analyze  上传 zip → 存 storage(import-temp)→ 解包预览(标题/分类建议/图片/去重)
 *   execute  按用户核对后的映射逐篇入库(published/source=import),内嵌图片上传并改写引用
 * 中文文件名:zip 未必是 UTF-8(PowerShell/旧工具常 GBK)→ decodeFileName 先试 UTF-8 再 GBK。
 */
@Injectable()
export class KnowledgeImportService {
  private readonly logger = new Logger(KnowledgeImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * zip 文件名解码(JSZip 仅对**非 UTF-8 标记**的条目调用此回调):
   * 先按 UTF-8 严格试,失败退 GBK(政府/Windows 旧工具导出常见)。
   */
  private static decodeFileName(bytes: string[] | Uint8Array | Buffer): string {
    const buf = Array.isArray(bytes) ? Uint8Array.from(bytes.map((c) => Number(c))) : bytes;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      try {
        return new TextDecoder('gbk').decode(buf);
      } catch {
        return new TextDecoder('utf-8').decode(buf);
      }
    }
  }

  private async loadZip(buffer: Buffer): Promise<JSZip> {
    return JSZip.loadAsync(buffer, { decodeFileName: KnowledgeImportService.decodeFileName });
  }

  /** 条目声明的解压后大小(读中央目录元数据,不解压)——用于 zip bomb 前置拦截 */
  private declaredSize(f: JSZip.JSZipObject): number {
    const d = (f as unknown as { _data?: { uncompressedSize?: number } })._data;
    return d?.uncompressedSize ?? 0;
  }

  private async readEntryString(f: JSZip.JSZipObject): Promise<string> {
    if (this.declaredSize(f) > MD_MAX_BYTES) throw new BadRequestException('单个文档过大或疑似恶意压缩,已拒绝');
    return f.async('string');
  }

  private async readEntryBuffer(f: JSZip.JSZipObject): Promise<Buffer> {
    if (this.declaredSize(f) > ASSET_MAX_BYTES) throw new BadRequestException('单个资产过大或疑似恶意压缩,已拒绝');
    return f.async('nodebuffer');
  }

  /** 取 zip 内全部 md 文件条目(路径 → JSZipObject),跳过 docsify 空壳与目录项 */
  private mdEntries(zip: JSZip): Array<{ path: string; file: JSZip.JSZipObject }> {
    const out: Array<{ path: string; file: JSZip.JSZipObject }> = [];
    zip.forEach((relPath, file) => {
      if (file.dir) return;
      const base = relPath.split('/').pop() ?? relPath;
      if (base.startsWith('.') || DOCSIFY_SKIP.has(base)) return;
      if (base.toLowerCase().endsWith('.md') && base.toLowerCase() !== 'readme.md') {
        out.push({ path: relPath, file });
      }
    });
    return out;
  }

  /** zip 内路径规范化:去掉可能的单一顶层文件夹前缀(打包时常多套一层),统一为相对根 */
  private stripCommonRoot(paths: string[]): (p: string) => string {
    const firsts = new Set(paths.map((p) => p.split('/')[0]));
    // 仅当所有条目都在同一个顶层文件夹下、且该文件夹不是文件本身,才剥掉这层
    if (firsts.size === 1 && paths.every((p) => p.includes('/'))) {
      const root = [...firsts][0] + '/';
      return (p: string) => (p.startsWith(root) ? p.slice(root.length) : p);
    }
    return (p) => p;
  }

  /* ═══════════ analyze ═══════════ */

  async analyze(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    ctx: ActorCtx,
  ): Promise<ImportAnalysis> {
    if (!file) throw new BadRequestException('未收到文件');
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('请上传 .zip 压缩包(内含 .md 文件)');
    }
    const zip = await this.loadZip(file.buffer).catch(() => {
      throw new BadRequestException('压缩包无法解析,请确认是有效的 zip');
    });
    const mds = this.mdEntries(zip);
    if (mds.length === 0) throw new BadRequestException('压缩包内没有可导入的 .md 文件');

    const strip = this.stripCommonRoot(mds.map((m) => m.path));
    const allEntryPaths = new Set<string>();
    zip.forEach((p, f) => {
      if (!f.dir) allEntryPaths.add(strip(p));
    });

    // _sidebar.md 是否有效(其引用的文件是否真存在)—— 无效则忽略(本批就是模板残留)
    let sidebarIgnored = false;
    const sidebar = zip.file(/(^|\/)_sidebar\.md$/i)[0];
    if (sidebar) {
      const text = await sidebar.async('string').catch(() => '');
      const refs = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]).filter((r) => !/^https?:|^\//.test(r));
      const anyExists = refs.some((r) => allEntryPaths.has(r.replace(/^\.?\//, '')));
      sidebarIgnored = refs.length > 0 && !anyExists;
    }

    const existing = await this.prisma.knowledgeArticle.findMany({ select: { title: true } });
    const existTitles = new Set(existing.map((a) => a.title));

    const items: ImportItem[] = [];
    for (const { path, file: f } of mds) {
      const rel = strip(path);
      const text = await this.readEntryString(f).catch(() => '');
      const title = this.extractTitle(text, rel);
      const segs = rel.split('/');
      segs.pop(); // 去掉文件名
      const refs = this.extractAssetRefs(text);
      let found = 0;
      let missing = 0;
      const mdDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
      for (const r of refs) {
        const target = this.resolveZipPath(mdDir, r);
        if (target && allEntryPaths.has(target)) found += 1;
        else missing += 1;
      }
      items.push({
        path,
        title,
        dirSegments: segs.filter(Boolean).slice(0, 1), // 最多取一层子目录(配根分类=两级)
        assetsFound: found,
        assetsMissing: missing,
        dup: existTitles.has(title),
      });
    }

    const zipMeta = await this.storage.put(
      {
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: 'application/zip',
        ownerModule: 'knowledge',
        folder: 'import-temp',
        visibility: 'private',
        createdById: ctx.actorId,
      },
      ctx,
    );

    return {
      importFileId: zipMeta.id,
      items,
      sidebarIgnored,
      skippedNonMd: allEntryPaths.size - mds.length,
    };
  }

  /* ═══════════ execute ═══════════ */

  async execute(dto: ImportExecuteDto, ctx: ActorCtx) {
    const { meta, buffer } = await this.storage.getBuffer(dto.importFileId).catch(() => {
      throw new NotFoundException('导入包已失效,请重新上传');
    });
    // 收紧:只认「导入临时包」——否则可传任意恰为 zip 的 knowledge 文件,末尾 softDelete 会删其字节
    if (meta.ownerModule !== 'knowledge' || meta.folder !== 'import-temp') {
      throw new NotFoundException('导入包已失效,请重新上传');
    }
    const zip = await this.loadZip(buffer);
    const strip = this.stripCommonRoot(this.mdEntries(zip).map((m) => m.path));
    const entryByRel = new Map<string, JSZip.JSZipObject>();
    zip.forEach((p, f) => {
      if (!f.dir) entryByRel.set(strip(p), f);
    });

    // typeCode 存在性校验集合(导入路径不走 createArticle 的 assertCategoryAndType,须自校验)
    const validTypes = new Set(
      (await this.prisma.knowledgeType.findMany({ select: { code: true } })).map((t) => t.code),
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const warnings: string[] = [];

    for (const item of dto.items) {
      if (item.action === 'skip') {
        skipped += 1;
        continue;
      }
      if (!item.typeCode || !validTypes.has(item.typeCode)) {
        failed += 1;
        warnings.push(`「${item.title}」内容类型无效,已跳过`);
        continue;
      }
      const rel = strip(item.path);
      const f = entryByRel.get(rel) ?? zip.file(item.path);
      if (!f) {
        failed += 1;
        warnings.push(`「${item.title}」源文件未找到,已跳过`);
        continue;
      }

      // 先建文章拿 id(图片按 article-<id> 归档)→ 处理图片 → 回填改写后的正文/封面。
      // 失败时**补偿删除**已建文章 + 已上传图片,保证「失败=库中无残留」(failed 计数与库状态一致)。
      let article: { id: string } | null = null;
      let uploadedFileIds: string[] = [];
      try {
        const raw = await this.readEntryString(f);
        const categoryId = await this.ensureCategoryPath(item.categoryPath ?? []);
        const mdDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
        article = await this.prisma.knowledgeArticle.create({
          data: {
            title: item.title,
            categoryId,
            typeCode: item.typeCode,
            contentMd: raw,
            tagsJson: null,
            status: 'published',
            publishedAt: new Date(),
            source: 'import',
            authorId: ctx.actorId,
            authorName: ctx.actorName,
          },
        });
        const assets = await this.processAssets(raw, mdDir, entryByRel, article.id, ctx);
        uploadedFileIds = assets.uploadedFileIds;
        if (assets.missing.length) {
          warnings.push(`「${item.title}」有 ${assets.missing.length} 处图片/附件在包内缺失,已保留原引用`);
        }
        if (assets.content !== raw || assets.coverFileId) {
          await this.prisma.knowledgeArticle.update({
            where: { id: article.id },
            data: { contentMd: assets.content, coverFileId: assets.coverFileId ?? undefined },
          });
        }
        created += 1;
      } catch (e) {
        failed += 1;
        this.logger.warn(`导入「${item.title}」失败: ${(e as Error).message}`);
        warnings.push(`「${item.title}」导入失败:${(e as Error).message}`);
        if (article) await this.prisma.knowledgeArticle.delete({ where: { id: article.id } }).catch(() => {});
        for (const fid of uploadedFileIds) await this.storage.softDelete(fid, ctx).catch(() => {});
      }
    }

    // 清理临时 zip
    await this.storage.softDelete(dto.importFileId, ctx).catch(() => {});

    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.import',
      detail: { created, skipped, failed, total: dto.items.length },
    });
    return { created, skipped, failed, warnings };
  }

  /* ═══════════ 内部 ═══════════ */

  private extractTitle(md: string, relPath: string): string {
    for (const line of md.split('\n')) {
      const m = /^#\s+(.+?)\s*#*\s*$/.exec(line.trim());
      if (m) {
        const clean = cleanHeading(m[1]);
        if (clean) return clean.slice(0, 200);
      }
    }
    const base = relPath.split('/').pop() ?? relPath;
    return base.replace(/\.md$/i, '').slice(0, 200);
  }

  private extractAssetRefs(md: string): string[] {
    const refs: string[] = [];
    for (const m of md.matchAll(MD_IMG_RE)) refs.push(m[1]);
    for (const m of md.matchAll(HTML_IMG_RE)) refs.push(m[1]);
    // 只处理相对引用(跳过 http/https、绝对 /api、data:)
    return refs.filter((r) => r && !/^(https?:|\/|data:|#)/i.test(r));
  }

  /** 相对 md 目录解析 zip 内路径(处理 ./ 与 ../) */
  private resolveZipPath(mdDir: string, ref: string): string | null {
    const clean = decodeURIComponent(ref.split('#')[0].split('?')[0]);
    const parts = (mdDir + clean).split('/');
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') stack.pop();
      else stack.push(p);
    }
    return stack.length ? stack.join('/') : null;
  }

  /**
   * 处理正文内嵌图片/资产:zip 内能找到的上传 storage,再**锚定图片语法**改写引用;缺失的保留原样。
   * 改写走 MD_IMG_RE/HTML_IMG_RE 的回调(只替换 `](ref)` 与 `src="ref"` 里的 ref)——
   * 不做全文字面量替换,避免短 ref 是长 ref 子串(或单字符 ref)时误伤正文/互相破坏。
   */
  private async processAssets(
    md: string,
    mdDir: string,
    entryByRel: Map<string, JSZip.JSZipObject>,
    articleId: string,
    ctx: ActorCtx,
  ): Promise<{ content: string; coverFileId: string | null; missing: string[]; uploadedFileIds: string[] }> {
    const refs = [...new Set(this.extractAssetRefs(md))]; // 去重,同图多处引用只传一次
    const missing: string[] = [];
    const uploadedFileIds: string[] = [];
    const urlByRef = new Map<string, string>();
    let coverFileId: string | null = null;

    for (const ref of refs) {
      const target = this.resolveZipPath(mdDir, ref);
      const entry = target ? entryByRel.get(target) : undefined;
      if (!entry) {
        missing.push(ref);
        continue;
      }
      try {
        const bytes = await this.readEntryBuffer(entry);
        const name = target!.split('/').pop() ?? 'asset';
        const meta = await this.storage.put(
          {
            buffer: bytes,
            originalName: name,
            mimeType: '',
            ownerModule: 'knowledge',
            folder: `article-${articleId}`,
            visibility: 'private',
            createdById: ctx.actorId,
          },
          ctx,
        );
        urlByRef.set(ref, knowledgeFileRefFromId(meta.id));
        uploadedFileIds.push(meta.id);
        if (!coverFileId && /\.(png|jpe?g|webp|gif)$/i.test(name)) coverFileId = meta.id;
      } catch {
        missing.push(ref); // 上传失败(如扩展名不放行)按缺失处理,保留原引用
      }
    }

    // 锚定替换:只在图片语法内把 ref 换成新 url(命中 urlByRef 的才换,其余原样)
    const swap = (whole: string, captured: string) => {
      const url = urlByRef.get(captured);
      return url ? whole.replace(captured, url) : whole;
    };
    const content = md
      .replace(new RegExp(MD_IMG_RE.source, 'g'), (m, p1) => swap(m, p1))
      .replace(new RegExp(HTML_IMG_RE.source, HTML_IMG_RE.flags), (m, p1) => swap(m, p1));

    return { content, coverFileId, missing, uploadedFileIds };
  }

  /** 幂等建/找分类路径(最多两级),返回叶子分类 id */
  private async ensureCategoryPath(names: string[]): Promise<string> {
    const path = names.map((n) => n.trim()).filter(Boolean).slice(0, 2);
    if (path.length === 0) throw new BadRequestException('缺少领域分类');
    let parentId: string | null = null;
    let leafId = '';
    for (const name of path) {
      const found = await this.prisma.knowledgeCategory.findFirst({ where: { name, parentId } });
      const cat = found ?? (await this.prisma.knowledgeCategory.create({ data: { name, parentId } }));
      parentId = cat.id;
      leafId = cat.id;
    }
    return leafId;
  }
}
