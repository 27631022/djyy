import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma';
import { StorageService } from '../storage';
import { AuditService } from '../audit';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 公共头像库文件约定文件夹(须以 avatars 开头:公开口 + GC 豁免都按它判) */
export const AVATAR_LIBRARY_FOLDER = 'avatars/library';

const GENDERS = new Set(['male', 'female', 'neutral']);
/** 缩略图边长(列表网格用,省流量) */
const THUMB_SIZE = 256;

export interface AvatarLibraryItemView {
  id: string;
  name: string;
  gender: string;
  source: string;
  hasConfig: boolean;
  fileId: string;
  /** 原图公开 URL(相对 API,前端经 resolveAvatarUrl 拼 origin) */
  url: string;
  /** 缩略图公开 URL(无缩略图回退原图) */
  thumbUrl: string;
  createdAt: Date;
}

/**
 * 公共头像库 —— 全平台共享的头像资产管理。
 * 入库 = 前端先 storage 上传(ownerModule=user, folder=avatars/library)拿 fileId → POST 提交;
 * 服务端校验文件归属约定 + 生成 256px webp 缩略图;删除条目联动软删 原图 + 缩略图。
 * 上传件与后续「头像编辑器」产物同库(source=upload|studio,studio 带 configJson 可回编辑)。
 */
@Injectable()
export class AvatarLibraryService {
  private readonly logger = new Logger(AvatarLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private toView(row: {
    id: string;
    name: string;
    gender: string;
    source: string;
    configJson: string | null;
    fileId: string;
    thumbFileId: string | null;
    createdAt: Date;
  }): AvatarLibraryItemView {
    return {
      id: row.id,
      name: row.name,
      gender: row.gender,
      source: row.source,
      hasConfig: !!row.configJson,
      fileId: row.fileId,
      url: `/api/public/avatars/${row.fileId}`,
      thumbUrl: `/api/public/avatars/${row.thumbFileId ?? row.fileId}`,
      createdAt: row.createdAt,
    };
  }

  async list(opts: { q?: string; gender?: string }): Promise<AvatarLibraryItemView[]> {
    // query 参数可被构造成数组(?q=a&q=b),非 string 一律忽略,防 .trim() 500
    const q = typeof opts.q === 'string' ? opts.q.trim() : '';
    const gender = typeof opts.gender === 'string' ? opts.gender : '';
    const where: Record<string, unknown> = {};
    if (q) where.name = { contains: q, mode: 'insensitive' };
    if (gender && GENDERS.has(gender)) where.gender = gender;
    const rows = await this.prisma.avatarLibraryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((r) => this.toView(r));
  }

  /** 详情(含 configJson,编辑器「回灌再编辑」用)。 */
  async detail(id: string): Promise<AvatarLibraryItemView & { configJson: string | null }> {
    const row = await this.prisma.avatarLibraryItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('头像不存在');
    return { ...this.toView(row), configJson: row.configJson };
  }

  async add(
    dto: { fileId: string; name?: string; gender?: string; configJson?: string },
    actor: ActorCtx,
  ): Promise<AvatarLibraryItemView> {
    const meta = await this.storage.getMeta(dto.fileId); // 不存在/软删 → NotFound
    if (!meta.mimeType.startsWith('image/')) {
      throw new BadRequestException('头像库只收图片文件');
    }
    // 归属校验:**精确限定库文件夹**(avatars/library[/*])。放宽到 avatars* 会把「个人头像文件」
    // (avatars/{工号}-{姓名},avatar.service 生成)收编入库 —— 删除库条目时反手销毁员工现用/历史头像。
    const folder = meta.folder ?? '';
    if (
      meta.ownerModule !== 'user' ||
      !(folder === AVATAR_LIBRARY_FOLDER || folder.startsWith(`${AVATAR_LIBRARY_FOLDER}/`))
    ) {
      throw new BadRequestException(
        '文件归属不符合头像库约定(须以 ownerModule=user、folder=avatars/library 上传)',
      );
    }

    const name = (dto.name?.trim() || meta.originalName.replace(/\.[a-z0-9]+$/i, '')).slice(0, 80);
    const gender = dto.gender && GENDERS.has(dto.gender) ? dto.gender : 'neutral';

    // 编辑器产物:configJson 必须是合法 JSON 对象(回灌再编辑的前提),带它即 source=studio
    let configJson: string | null = null;
    if (dto.configJson) {
      try {
        const parsed: unknown = JSON.parse(dto.configJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('非对象');
        configJson = dto.configJson;
      } catch {
        throw new BadRequestException('configJson 不是合法的 JSON 对象');
      }
    }
    const source = configJson ? 'studio' : 'upload';

    // 缩略图:256 webp(失败不阻断入库,前端回退原图)
    let thumbFileId: string | null = null;
    try {
      const { buffer } = await this.storage.getBuffer(dto.fileId);
      const thumb = await sharp(buffer)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
      const stored = await this.storage.put(
        {
          buffer: thumb,
          originalName: `${name}.thumb.webp`,
          mimeType: 'image/webp',
          ownerModule: 'user',
          folder: `${AVATAR_LIBRARY_FOLDER}/thumbs`,
          visibility: 'public',
          createdById: actor.actorId,
        },
        actor,
      );
      thumbFileId = stored.id;
    } catch (e) {
      this.logger.warn(`头像库缩略图生成失败 fileId=${dto.fileId}: ${String(e)}`);
    }

    let row;
    try {
      row = await this.prisma.avatarLibraryItem.create({
        data: {
          name,
          gender,
          fileId: dto.fileId,
          thumbFileId,
          configJson,
          source,
          createdById: actor.actorId,
        },
      });
    } catch (e) {
      // create 失败(唯一撞车/DB 异常)都要清掉刚生成的缩略图 —— avatars/* 图片被 GC 豁免,残留即永久泄漏
      if (thumbFileId) await this.storage.softDelete(thumbFileId, actor).catch(() => undefined);
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('该文件已在头像库中');
      }
      throw e;
    }

    await this.audit.log({
      action: 'avatar.library.add',
      target: row.id,
      ...actor,
      detail: JSON.stringify({ name, gender, fileId: dto.fileId, thumbFileId }),
    });
    return this.toView(row);
  }

  async update(
    id: string,
    dto: { name?: string; gender?: string },
    actor: ActorCtx,
  ): Promise<AvatarLibraryItemView> {
    const before = await this.prisma.avatarLibraryItem.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('头像不存在');
    const data: Record<string, string> = {};
    if (dto.name?.trim()) data.name = dto.name.trim().slice(0, 80);
    if (dto.gender && GENDERS.has(dto.gender)) data.gender = dto.gender;
    if (Object.keys(data).length === 0) return this.toView(before);
    const row = await this.prisma.avatarLibraryItem.update({ where: { id }, data });
    await this.audit.log({
      action: 'avatar.library.update',
      target: id,
      ...actor,
      detail: JSON.stringify({ before: { name: before.name, gender: before.gender }, after: data }),
    });
    return this.toView(row);
  }

  async remove(id: string, actor: ActorCtx): Promise<{ ok: true; fileKept: boolean }> {
    const row = await this.prisma.avatarLibraryItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('头像不存在');

    // 交叉校验消费方引用(照 showcase/knowledge「共用文件不误删」惯例):库是「引用不复制」——
    // 个人头像挑选会把 User.avatarUrl 存成 /api/public/avatars/<fileId>,互动 "u:" 前缀同理。
    // 有引用时只删库行(+仅库网格自用的缩略图),**保留原图字节**,否则删条目=全站头像 404。
    const [userRefs, playerRefs] = await Promise.all([
      this.prisma.user.count({ where: { avatarUrl: { contains: row.fileId } } }),
      this.prisma.interactivePlayer.count({ where: { avatar: `u:${row.fileId}` } }),
    ]);
    const fileKept = userRefs + playerRefs > 0;

    await this.prisma.avatarLibraryItem.delete({ where: { id } });
    const toDelete = fileKept ? [row.thumbFileId] : [row.fileId, row.thumbFileId];
    for (const fid of toDelete) {
      if (!fid) continue;
      try {
        await this.storage.softDelete(fid, actor);
      } catch (e) {
        // 行已删,残余文件已由 collectInUseFileIds 摘除「在用」身份 —— 但 avatars/* 图片被 GC
        // 文件夹豁免兜底保护着,不会被 purge;真要回收需人工按审计里的 fileId 处理
        this.logger.warn(`头像库删除联动删文件失败 fileId=${fid}: ${String(e)}`);
      }
    }
    await this.audit.log({
      action: 'avatar.library.remove',
      target: id,
      ...actor,
      detail: JSON.stringify({
        name: row.name,
        fileId: row.fileId,
        thumbFileId: row.thumbFileId,
        fileKept,
        userRefs,
        playerRefs,
      }),
    });
    return { ok: true, fileKept };
  }

  /**
   * 「在用」storage fileId 自报(孤儿 GC 用,MaintenanceService 聚合)。
   * ⚠ 当前 avatars/* 图片同时被 orphanCandidates 的文件夹豁免罩着(个人头像无业务表引用,只能按夹豁免);
   * 本表是逐条引用,自报后即使将来收紧文件夹豁免,库文件也不会沦为孤儿候选被 purge。
   */
  async collectInUseFileIds(): Promise<Set<string>> {
    const rows = await this.prisma.avatarLibraryItem.findMany({
      select: { fileId: true, thumbFileId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.fileId);
      if (r.thumbFileId) ids.add(r.thumbFileId);
    }
    return ids;
  }
}
