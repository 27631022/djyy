import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { StorageService } from '../storage';
import { normalizeConfig } from './config';
import { findOrphans, metricsOf, paginate } from './grid';
import { parseDoc } from './parse/doc-parser';
import { parseDocx } from './parse/docx-parser';
import { parseMd } from './parse/md-parser';
import { recognize } from './recognize';
import { renderDocx } from './render/docx-renderer';
import { BUILTIN_PRESETS, BUILTIN_PRESET_MAP, DEFAULT_PRESET_KEY } from './presets';
import type { DocElement, DocFormatConfig, ElementType } from './types';
import type { SaveTemplateDto } from './dto/doc-format.dto';

/** 审计上下文(storage/audit 都没把这个形状导出,各模块自己声明,与 storage.service 同款) */
export interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 本模块在 storage 里的归属 */
const OWNER = 'doc-format';
/** 上传的原件放这 */
const FOLDER_SOURCE = 'source';
/** 排好版的产物放这 */
const FOLDER_OUTPUT = 'output';

export type TemplateView = {
  id: string;
  name: string;
  description: string | null;
  builtinKey: string | null;
  isDefault: boolean;
  config: DocFormatConfig;
  updatedAt: Date;
};

export type AnalyzeResult = {
  fileId: string;
  fileName: string;
  templateId: string;
  elements: DocElement[];
  orphans: ReturnType<typeof findOrphans>;
  pages: ReturnType<typeof paginate>;
  metrics: ReturnType<typeof metricsOf>;
};

type UploadedDoc = { originalname: string; size: number; buffer: Buffer };

@Injectable()
export class DocFormatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------- 模板

  private view(row: {
    id: string;
    name: string;
    description: string | null;
    builtinKey: string | null;
    isDefault: boolean;
    configJson: string;
    updatedAt: Date;
  }): TemplateView {
    // 库里的 JSON 坏了也不能让整页打不开 —— 保持 null,归一化会兜回默认值
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(row.configJson);
    } catch {
      /* 忽略 */
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      builtinKey: row.builtinKey,
      isDefault: row.isDefault,
      config: normalizeConfig(parsed),
      updatedAt: row.updatedAt,
    };
  }

  async listTemplates(): Promise<TemplateView[]> {
    const rows = await this.prisma.docFormatTemplate.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.view(r));
  }

  async getTemplate(id: string): Promise<TemplateView> {
    const row = await this.prisma.docFormatTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('排版模板不存在');
    return this.view(row);
  }

  /**
   * 取要用的配置:指定了就用指定的,否则用默认模板。
   *
   * ⚠ **返回的 id 必须是能拿回来复用的真实模板 id**:analyze 会把它当 templateId 下发给前端,
   *   前端原样回传给 preview/render(那里 @IsNotEmpty)。曾经在「一个默认都没有」时返回
   *   { id:'' } + 内置预设 —— analyze 照样 201,但之后 preview/render 全部 400
   *   「templateId should not be empty」,整个功能卡死且报错与真因毫无关系。
   *   现在没有默认就顺位取第一个(内置模板不可删 + 启动 ensureBuiltins 补种,库里必有行)。
   */
  private async configFor(templateId?: string): Promise<{ id: string; config: DocFormatConfig }> {
    if (templateId) {
      const t = await this.getTemplate(templateId);
      return { id: t.id, config: t.config };
    }
    const row =
      (await this.prisma.docFormatTemplate.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.docFormatTemplate.findFirst({ orderBy: { createdAt: 'asc' } }));
    if (row) {
      const t = this.view(row);
      return { id: t.id, config: t.config };
    }
    // 库空(理论上不会:ensureBuiltins 每次启动补种)。兜个底,别让上传直接 500
    return { id: '', config: BUILTIN_PRESET_MAP[DEFAULT_PRESET_KEY].config };
  }

  /** 这套配置是否偏离了它对应的内置默认值。自建模板恒 false(它没有「默认值」这回事) */
  private differsFromPreset(builtinKey: string | null, config: DocFormatConfig): boolean {
    if (!builtinKey) return false;
    const preset = BUILTIN_PRESET_MAP[builtinKey];
    if (!preset) return false;
    return JSON.stringify(config) !== JSON.stringify(normalizeConfig(preset.config));
  }

  /** 同一时刻只能有一个默认模板 */
  private async clearOtherDefaults(keepId: string): Promise<void> {
    await this.prisma.docFormatTemplate.updateMany({
      where: { isDefault: true, id: { not: keepId } },
      data: { isDefault: false },
    });
  }

  async createTemplate(dto: SaveTemplateDto, ctx: AuditCtx): Promise<TemplateView> {
    const config = normalizeConfig(dto.config);
    const row = await this.prisma.docFormatTemplate.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        configJson: JSON.stringify(config),
        isDefault: dto.isDefault ?? false,
        createdById: ctx.actorId ?? null,
      },
    });
    if (row.isDefault) await this.clearOtherDefaults(row.id);
    await this.audit.log({ action: 'doc-format.template.create', detail: row.name, ...ctx });
    return this.view(row);
  }

  async updateTemplate(id: string, dto: SaveTemplateDto, ctx: AuditCtx): Promise<TemplateView> {
    const cur = await this.getTemplate(id);
    // 以当前值为基线做归一化:前端只改了几个字段也不会把其余字段打回默认
    const config = dto.config === undefined ? cur.config : normalizeConfig(dto.config, cur.config);
    const row = await this.prisma.docFormatTemplate.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        configJson: JSON.stringify(config),
        // 「用户改过」按参数是否真的偏离代码默认值判,而不是「点过保存」——
        // 光是「设为默认」也走这里,不该因此就把它钉死在旧默认值上
        userEdited: this.differsFromPreset(cur.builtinKey, config),
        ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
      },
    });
    if (row.isDefault) await this.clearOtherDefaults(row.id);
    await this.audit.log({ action: 'doc-format.template.update', detail: row.name, ...ctx });
    return this.view(row);
  }

  async removeTemplate(id: string, ctx: AuditCtx): Promise<{ ok: true }> {
    const cur = await this.getTemplate(id);
    if (cur.builtinKey) {
      throw new BadRequestException('内置模板不能删除,可以「恢复默认」或复制一份再改');
    }
    await this.prisma.docFormatTemplate.delete({ where: { id } });
    // 删掉的是默认模板 → 必须有人接任,否则「默认」这个不变量就破了
    // (configFor 已能顺位兜底,但让库自己保持自洽,别把不变量寄托在读路径上)
    if (cur.isDefault) await this.ensureSomeDefault();
    await this.audit.log({ action: 'doc-format.template.remove', detail: cur.name, ...ctx });
    return { ok: true };
  }

  /** 保证库里恒有且仅有一个默认模板:没有就让内置默认(再不济第一个)接任 */
  private async ensureSomeDefault(): Promise<void> {
    const has = await this.prisma.docFormatTemplate.findFirst({ where: { isDefault: true } });
    if (has) return;
    const heir =
      (await this.prisma.docFormatTemplate.findFirst({ where: { builtinKey: DEFAULT_PRESET_KEY } })) ??
      (await this.prisma.docFormatTemplate.findFirst({ orderBy: { createdAt: 'asc' } }));
    if (heir) {
      await this.prisma.docFormatTemplate.update({
        where: { id: heir.id },
        data: { isDefault: true },
      });
    }
  }

  /** 内置模板恢复默认:按 builtinKey 从 presets.ts 重读 */
  async resetTemplate(id: string, ctx: AuditCtx): Promise<TemplateView> {
    const cur = await this.getTemplate(id);
    if (!cur.builtinKey) throw new BadRequestException('自建模板没有默认值可恢复');
    const preset = BUILTIN_PRESET_MAP[cur.builtinKey];
    if (!preset) throw new BadRequestException('这套内置模板已经下架了');
    const row = await this.prisma.docFormatTemplate.update({
      where: { id },
      data: {
        name: preset.name,
        description: preset.description,
        configJson: JSON.stringify(preset.config),
        userEdited: false, // 恢复默认 = 回到「跟随代码默认值」的状态
      },
    });
    await this.audit.log({ action: 'doc-format.template.reset', detail: preset.name, ...ctx });
    return this.view(row);
  }

  /** 复制一份(内置模板想改就复制) */
  async duplicateTemplate(id: string, ctx: AuditCtx): Promise<TemplateView> {
    const cur = await this.getTemplate(id);
    const row = await this.prisma.docFormatTemplate.create({
      data: {
        name: `${cur.name} 副本`,
        description: cur.description,
        configJson: JSON.stringify(cur.config),
        createdById: ctx.actorId ?? null,
      },
    });
    await this.audit.log({ action: 'doc-format.template.duplicate', detail: row.name, ...ctx });
    return this.view(row);
  }

  /**
   * 启动时同步内置预设:缺的补上;已有但**用户没改过**的,跟着 presets.ts 的默认值刷新。
   *
   * ⚠ 曾经是「已有的一概不动」—— 结果改了 presets.ts 的默认值对已种进库的内置模板毫无效果,
   *   悄悄地不生效(实测:把 title 的段后空行去掉后,库里那份仍是旧值,预览照旧多一个空行)。
   *   注意 normalizeConfig 会用代码默认值补**缺失的键**,所以「新增的元素类型」本来就能自动到位,
   *   容易让人误以为整套默认值都会跟着走 —— 已存在的键的**值**是不会的。
   * 用户自己调过参数的(userEdited)不碰 —— 想回到默认让他点「恢复默认」。
   */
  async ensureBuiltins(): Promise<void> {
    for (const p of BUILTIN_PRESETS) {
      const exists = await this.prisma.docFormatTemplate.findUnique({ where: { builtinKey: p.key } });
      if (exists) {
        if (exists.userEdited) continue;
        const want = JSON.stringify(p.config);
        if (exists.configJson === want) continue;
        await this.prisma.docFormatTemplate.update({
          where: { id: exists.id },
          data: { name: p.name, description: p.description, configJson: want },
        });
        continue;
      }
      try {
        await this.prisma.docFormatTemplate.create({
          data: {
            name: p.name,
            description: p.description,
            builtinKey: p.key,
            configJson: JSON.stringify(p.config),
            isDefault: p.key === DEFAULT_PRESET_KEY,
          },
        });
      } catch (e) {
        // builtinKey 是 @unique:并发启动/多副本会撞 P2002。已经有人种上了就是好事,别让应用起不来
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    // 库若处于「一个默认都没有」的坏态(如默认模板被删过),重启即自愈
    await this.ensureSomeDefault();
  }

  // ------------------------------------------------------------- 排版

  /**
   * 解析入口。
   * 解析器内部抛的是原生 Error(JSZip/word-extractor 自己的),不归一化的话会冒到全局过滤器
   * 变成 500「Internal server error」—— 而最常见的真实误操作恰恰在这:用户把 OA 下载的 .doc
   * 改名成 .docx 再传(README 说了 OA 产出的就是 .doc)。这类坏输入本模块的既定契约是 400。
   */
  private async parseBuffer(name: string, buf: Buffer) {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    if (!['doc', 'docx', 'md'].includes(ext)) throw new BadRequestException('只支持 .doc / .docx / .md');
    try {
      if (ext === 'docx') return await parseDocx(buf);
      if (ext === 'md') return parseMd(buf);
      return await parseDoc(buf);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const hint =
        ext === 'docx'
          ? '这个文件不是有效的 .docx。如果是从 OA 下载的,它多半其实是 .doc —— 请改回 .doc 扩展名,或用 Word 另存为 .docx'
          : ext === 'md'
            ? '这个 .md 读不出内容(要求 UTF-8 编码)'
            : '这个文件不是有效的 .doc,读不出内容';
      throw new BadRequestException(`${hint}(${(e as Error).message})`);
    }
  }

  private compose(els: DocElement[], config: DocFormatConfig) {
    const pages = paginate(els, config);
    // 给孤字补上页码 —— 只报「第 N 段」用户数不出来,得给能在预览里找到的坐标
    const pageOf = new Map<number, number>();
    for (const pg of pages) {
      for (const ln of pg.lines) {
        if (ln.orphan && ln.index !== undefined) pageOf.set(ln.index, pg.pageNo);
      }
    }
    return {
      elements: els,
      orphans: findOrphans(els, config).map((o) => ({ ...o, pageNo: pageOf.get(o.index) })),
      pages,
      metrics: metricsOf(config),
    };
  }

  /** 按人工确认页改过的类型覆盖 */
  private applyOverrides(
    els: DocElement[],
    overrides: { index: number; type: ElementType }[] | undefined,
    config: DocFormatConfig,
  ): DocElement[] {
    if (!overrides?.length) return els;
    const map = new Map(overrides.map((o) => [o.index, o.type]));
    return els.map((e) => {
      const t = map.get(e.index);
      if (!t || t === e.type) return e;
      // 改了类型就重算 runs:article 要 run 级切分,别的类型整段一个 run
      const runs =
        t === 'article' && config.articleRule.splitNumber
          ? (recognize([{ index: e.index, text: e.text }], config)[0]?.type === 'article'
              ? recognize([{ index: e.index, text: e.text }], config)[0].runs
              : [{ text: e.text }])
          : [{ text: e.text }];
      return { ...e, type: t, runs, confidence: 'high' as const, note: '已人工指定' };
    });
  }

  /** 上传 → 存原件 → 解析 → 识别 → 孤字 + 预览 */
  async analyze(file: UploadedDoc, ctx: AuditCtx): Promise<AnalyzeResult> {
    const paras = await this.parseBuffer(file.originalname, file.buffer);
    if (!paras.length) throw new BadRequestException('这份文件里没读到任何段落');
    const { id: templateId, config } = await this.configFor();
    const els = recognize(paras, config);

    const stored = await this.storage.put(
      {
        buffer: file.buffer,
        originalName: file.originalname,
        ownerModule: OWNER,
        folder: FOLDER_SOURCE,
        // 记上传者 —— 反馈「就用刚才转换的这份」时要凭它校验文件归属(见 assertOwnFeedbackFiles)
        createdById: ctx.actorId,
      },
      ctx,
    );
    await this.audit.log({ action: 'doc-format.analyze', detail: file.originalname, ...ctx });

    return {
      fileId: stored.id,
      fileName: file.originalname,
      templateId,
      ...this.compose(els, config),
    };
  }

  /** 改了类型或换了模板 → 重算预览。服务端权威,前端不镜像这套算法(杜绝漂移) */
  async preview(
    fileId: string,
    templateId: string | undefined,
    overrides: { index: number; type: ElementType }[] | undefined,
  ) {
    const { config } = await this.configFor(templateId);
    const els = await this.elementsOf(fileId, config, overrides);
    return this.compose(els, config);
  }

  /**
   * 从存着的原件重新解析 —— 正文文本永远来自服务端,客户端只能改类型改不了字。
   * 归属校验(照 knowledge-import 的 folder 守卫):只认自己 analyze 存下的原件,
   * 否则任意 fileId 都能拿来当输入,把别的模块的文件读出来。
   */
  private async elementsOf(
    fileId: string,
    config: DocFormatConfig,
    overrides: { index: number; type: ElementType }[] | undefined,
  ): Promise<DocElement[]> {
    const { meta, buffer } = await this.storage.getBuffer(fileId);
    if (meta.ownerModule !== OWNER || meta.folder !== FOLDER_SOURCE) {
      throw new NotFoundException('原件不存在或已过期,请重新上传');
    }
    const paras = await this.parseBuffer(meta.originalName, buffer);
    return this.applyOverrides(recognize(paras, config), overrides, config);
  }

  /** 生成排好版的 .docx,存 storage 返回 fileId(前端走 storage 下载口取回) */
  async render(
    fileId: string,
    templateId: string,
    overrides: { index: number; type: ElementType }[] | undefined,
    ctx: AuditCtx,
  ): Promise<{ fileId: string; fileName: string; orphans: number }> {
    const { config } = await this.configFor(templateId);
    const els = await this.elementsOf(fileId, config, overrides);
    const meta = await this.storage.getMeta(fileId);
    const buf = await renderDocx(els, config);

    const base = meta.originalName.replace(/\.(doc|docx|md)$/i, '');
    const fileName = `${base}-已排版.docx`;
    const stored = await this.storage.put(
      { buffer: buf, originalName: fileName, ownerModule: OWNER, folder: FOLDER_OUTPUT },
      ctx,
    );
    await this.audit.log({ action: 'doc-format.render', detail: fileName, ...ctx });
    return { fileId: stored.id, fileName, orphans: findOrphans(els, config).length };
  }

  /*
   * 关于孤儿 GC:本模块**故意不注册** MaintenanceService.inUseFileIds()。
   *
   * 别的模块要注册,是因为它们的文件被业务表逐条引用(证书 PDF、任务附件…),漏注册会被真删。
   * 排版不一样:它是「上传 → 下载 → 结束」的一次性加工,原件和产物都没有任何业务表引用,
   * 用户的原文件在自己电脑上、产物已经下载走了。所以让这些文件在 30 天宽限期后
   * 自然进入孤儿候选、由管理员清掉,正是我们要的行为 —— 注册反而会让它们永远堆着。
   *
   * ⚠ 因此:如果以后加了「我的排版历史」这类要长期留存的功能,必须回来补注册,否则会被清掉。
   */
}
