import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timeout } from '@nestjs/schedule';
import sharp from 'sharp';
import { PrismaService } from '../prisma';
import { StorageService } from '../storage';
import { AuditService } from '../audit';
import { UserService } from '../user';
import { extractPopCutout } from './avatar-pop';
import { randomInt } from 'node:crypto';

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
/** popFileId 哨兵:已尝试抠像但图片不适用(复杂背景等),启动补扫不再重试 */
const POP_NONE = 'none';

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
  /** 「弹出人物」透明抠像公开 URL(不适用/未生成为 null) */
  popUrl: string | null;
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
    private readonly users: UserService,
  ) {}

  private toView(row: {
    id: string;
    name: string;
    gender: string;
    source: string;
    configJson: string | null;
    fileId: string;
    thumbFileId: string | null;
    popFileId: string | null;
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
      popUrl:
        row.popFileId && row.popFileId !== POP_NONE
          ? `/api/public/avatars/${row.popFileId}`
          : null,
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

  /**
   * 互动游戏用:随机抽 n 个库头像(fileId=原图、thumbFileId=缩略图,手机网格显示缩略图省流量,
   * 落 InteractivePlayer.avatar 存 "u:<fileId>" 原图 —— 与工牌进场同一标识,删除防护已覆盖)。
   * 库仅百余条,全量取 id 后 Fisher-Yates 局部洗牌即可,不必 raw SQL random()。
   */
  async randomForInteractive(n: number): Promise<{ fileId: string; thumbFileId: string | null }[]> {
    const rows = await this.prisma.avatarLibraryItem.findMany({
      select: { fileId: true, thumbFileId: true },
      take: 1000,
    });
    const count = Math.min(n, rows.length);
    for (let i = 0; i < count; i++) {
      const j = i + randomInt(rows.length - i);
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    return rows.slice(0, count);
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

    // 弹出抠像:纯色背景 → 透明人物 webp(通讯录悬浮"人物伸出圆圈"用;异常留 null 交启动补扫重试)
    let popFileId: string | null = null;
    try {
      popFileId =
        (await this.generatePop(dto.fileId, name, `${AVATAR_LIBRARY_FOLDER}/pops`, actor)) ??
        POP_NONE;
    } catch (e) {
      this.logger.warn(`头像库弹出抠像生成失败 fileId=${dto.fileId}: ${String(e)}`);
    }

    let row;
    try {
      row = await this.prisma.avatarLibraryItem.create({
        data: {
          name,
          gender,
          fileId: dto.fileId,
          thumbFileId,
          popFileId,
          configJson,
          source,
          createdById: actor.actorId,
        },
      });
    } catch (e) {
      // create 失败(唯一撞车/DB 异常)都要清掉刚生成的派生文件 —— avatars/* 图片被 GC 豁免,残留即永久泄漏
      if (thumbFileId) await this.storage.softDelete(thumbFileId, actor).catch(() => undefined);
      if (popFileId && popFileId !== POP_NONE) {
        await this.storage.softDelete(popFileId, actor).catch(() => undefined);
      }
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('该文件已在头像库中');
      }
      throw e;
    }

    await this.audit.log({
      action: 'avatar.library.add',
      target: row.id,
      ...actor,
      detail: JSON.stringify({ name, gender, fileId: dto.fileId, thumbFileId, popFileId }),
    });
    return this.toView(row);
  }

  /**
   * 生成「弹出人物」抠像并入 storage(落到指定文件夹),返回新 fileId;图片不适合抠像返回 null。
   * 异常上抛,由调用方决定(add 记 warn 留 null,补扫下次重试)。
   */
  private async generatePop(
    fileId: string,
    name: string,
    folder: string,
    actor: ActorCtx,
  ): Promise<string | null> {
    const { buffer } = await this.storage.getBuffer(fileId);
    const cutout = await extractPopCutout(buffer);
    if (!cutout) return null;
    const stored = await this.storage.put(
      {
        buffer: cutout,
        originalName: `${name}.pop.webp`,
        mimeType: 'image/webp',
        ownerModule: 'user',
        folder,
        visibility: 'public',
        createdById: actor.actorId,
      },
      actor,
    );
    return stored.id;
  }

  /**
   * 启动补扫:为存量库条目(popFileId=null,加列前入库的)生成弹出抠像。
   * 幂等 —— 成功记 fileId、不适用记 'none',二次启动无事可做;单张异常留 null 下次重试。
   * (照 TaskService @Timeout 启动补扫先例;单进程内跑,多副本需锁,单机 MVP 无虑)
   */
  @Timeout(25_000)
  async backfillPops(): Promise<void> {
    const rows = await this.prisma.avatarLibraryItem.findMany({
      where: { popFileId: null },
      select: { id: true, fileId: true, name: true },
    });
    if (!rows.length) return;
    let made = 0;
    let unsuitable = 0;
    let failed = 0;
    for (const r of rows) {
      let popId: string | null = null;
      try {
        popId = await this.generatePop(r.fileId, r.name, `${AVATAR_LIBRARY_FOLDER}/pops`, {});
        await this.prisma.avatarLibraryItem.update({
          where: { id: r.id },
          data: { popFileId: popId ?? POP_NONE },
        });
        if (popId) made++;
        else unsuitable++;
      } catch (e) {
        failed++;
        // update 失败(典型:补扫期间条目被删 P2025)要补偿删已入库的抠像 ——
        // avatars/* 被 GC 文件夹豁免,无行引用的残留即永久泄漏
        if (popId) await this.storage.softDelete(popId, {}).catch(() => undefined);
        this.logger.warn(`弹出抠像补扫失败 fileId=${r.fileId}: ${String(e)}`);
      }
    }
    this.logger.log(`弹出抠像补扫完成:生成 ${made},不适用 ${unsuitable},失败 ${failed}`);
    await this.audit.log({
      action: 'avatar.library.pop_backfill',
      target: 'bulk',
      detail: JSON.stringify({ total: rows.length, made, unsuitable, failed }),
    });
  }

  /** 删除个人头像文件时联动清其弹出抠像(映射行 + 派生文件);无映射静默返回。 */
  async dropPersonalPop(fileId: string, actor: ActorCtx): Promise<void> {
    const row = await this.prisma.avatarPopCutout.findUnique({ where: { fileId } });
    if (!row) return;
    await this.prisma.avatarPopCutout.delete({ where: { fileId } }).catch(() => undefined);
    if (row.popFileId !== POP_NONE) {
      await this.storage.softDelete(row.popFileId, actor).catch(() => undefined);
    }
  }

  /**
   * 公开口用:原图 fileId → 弹出抠像 fileId(不适用 → null)。
   * 公共库头像查 AvatarLibraryItem;个人头像(AI 生成/上传)查 AvatarPopCutout 映射,
   * 未生成则**懒生成**(首访触发一次,'none' 落表后不再重试;异常不落表下次再试)。
   */
  async popFileIdOf(fileId: string): Promise<string | null> {
    const row = await this.prisma.avatarLibraryItem.findUnique({
      where: { fileId },
      select: { popFileId: true },
    });
    if (row) {
      const p = row.popFileId;
      return p && p !== POP_NONE ? p : null;
    }
    const personal = await this.prisma.avatarPopCutout.findUnique({ where: { fileId } });
    if (personal) return personal.popFileId !== POP_NONE ? personal.popFileId : null;
    return this.ensurePersonalPop(fileId);
  }

  /** 个人头像懒生成进行中的去重(公开口并发首访只算一次) */
  private readonly personalPopInFlight = new Map<string, Promise<string | null>>();

  private ensurePersonalPop(fileId: string): Promise<string | null> {
    const inflight = this.personalPopInFlight.get(fileId);
    if (inflight) return inflight;
    const task = (async (): Promise<string | null> => {
      // 与公开口 serve 同款归属约束:只对头像图片文件做,其余一律视为无抠像(匿名可触发,收攻击面)
      const meta = await this.storage.getMeta(fileId).catch(() => null);
      if (
        !meta ||
        meta.ownerModule !== 'user' ||
        !(meta.folder ?? '').includes('avatars') ||
        !meta.mimeType.startsWith('image/')
      ) {
        return null;
      }
      const name = meta.originalName.replace(/\.[a-z0-9]+$/i, '');
      let popId: string | null;
      try {
        // 抠像与原图同文件夹(群晖 File Station 里跟着员工文件夹走)
        popId = await this.generatePop(fileId, name, meta.folder ?? 'avatars', {});
      } catch (e) {
        // 磁盘缺文件/解码失败等:不落表,下次访问重试(便宜且幂等)
        this.logger.warn(`个人头像弹出抠像生成失败 fileId=${fileId}: ${String(e)}`);
        return null;
      }
      try {
        await this.prisma.avatarPopCutout.create({
          data: { fileId, popFileId: popId ?? POP_NONE },
        });
      } catch (e) {
        // 唯一撞车(多进程等罕见并发):以先落表者为准,自己这份补偿删掉防孤儿
        if (popId) await this.storage.softDelete(popId, {}).catch(() => undefined);
        const winner = await this.prisma.avatarPopCutout
          .findUnique({ where: { fileId } })
          .catch(() => null);
        if (!winner) {
          this.logger.warn(`个人头像抠像映射落表失败 fileId=${fileId}: ${String(e)}`);
          return null;
        }
        return winner.popFileId !== POP_NONE ? winner.popFileId : null;
      }
      await this.audit.log({
        action: 'avatar.pop.generate',
        target: fileId,
        detail: JSON.stringify({ popFileId: popId ?? POP_NONE, folder: meta.folder }),
      });
      return popId;
    })();
    this.personalPopInFlight.set(fileId, task);
    void task.finally(() => this.personalPopInFlight.delete(fileId));
    return task;
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

    // 派生文件清单取 delete 返回的「删除时点行」—— findUnique 快照到 delete 之间补扫可能刚回填
    // popFileId,按陈旧快照删会漏掉新生成的抠像(无行引用 + GC 豁免 = 永久孤儿)
    const deleted = await this.prisma.avatarLibraryItem.delete({ where: { id } });
    // 缩略图/弹出抠像是库派生资产(引用方只指原图 fileId),随条目一并删;原图有引用才保留
    const popFile =
      deleted.popFileId && deleted.popFileId !== POP_NONE ? deleted.popFileId : null;
    const toDelete = fileKept
      ? [deleted.thumbFileId, popFile]
      : [deleted.fileId, deleted.thumbFileId, popFile];
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
        name: deleted.name,
        fileId: deleted.fileId,
        thumbFileId: deleted.thumbFileId,
        popFileId: deleted.popFileId,
        fileKept,
        userRefs,
        playerRefs,
      }),
    });
    return { ok: true, fileKept };
  }

  /** 无头像 active 用户数(前端「分配默认头像」确认框展示规模)。 */
  async noAvatarCount(): Promise<{ count: number }> {
    return { count: await this.users.countActiveWithoutAvatar() };
  }

  /**
   * 为所有无头像的 active 用户批量挂默认头像 —— **同性别随机**从公共库挑一张。
   * 男从库里 male、女从 female;缺同性别素材回退 neutral;都没有则该人跳过。
   * 幂等:只覆盖仍无头像的(user.bulkSetDefaultAvatar 内 where 兜),重复点不动已有/用户自选头像。
   * 两万人 → 聚合成「≤库容量」组批量 update(避免逐条),随机用 crypto.randomInt。
   */
  async applyDefaults(
    actor: ActorCtx,
  ): Promise<{ assigned: number; skipped: number; noAvatarBefore: number }> {
    // 1. 公共库按性别分组 fileId
    const rows = await this.prisma.avatarLibraryItem.findMany({
      select: { fileId: true, gender: true },
    });
    const pool: Record<string, string[]> = { male: [], female: [], neutral: [] };
    for (const r of rows) (pool[r.gender] ?? pool.neutral).push(r.fileId);

    // 2. 无头像用户(带解析出的性别)
    const users = await this.users.listActiveWithoutAvatar();
    const noAvatarBefore = users.length;

    // 3. 每人按性别随机挑一个库 fileId,聚合成 {fileId → [userId...]}
    const byFile = new Map<string, string[]>();
    let skipped = 0;
    for (const u of users) {
      const g = u.gender === 'male' || u.gender === 'female' ? u.gender : 'neutral';
      const candidates = pool[g].length ? pool[g] : pool.neutral;
      if (!candidates.length) {
        skipped++; // 同性别 + neutral 都没素材 → 跳过
        continue;
      }
      const fileId = candidates[randomInt(candidates.length)];
      const arr = byFile.get(fileId);
      if (arr) arr.push(u.id);
      else byFile.set(fileId, [u.id]);
    }

    // 4. 按 fileId 分组批量落库(幂等:只动仍无头像的)
    const groups = [...byFile.entries()].map(([fileId, userIds]) => ({ fileId, userIds }));
    const { updated } = await this.users.bulkSetDefaultAvatar(groups, actor);

    await this.audit.log({
      action: 'avatar.apply_defaults',
      target: 'bulk',
      ...actor,
      detail: JSON.stringify({ noAvatarBefore, assigned: updated, skipped, poolTotal: rows.length }),
    });
    return { assigned: updated, skipped, noAvatarBefore };
  }

  /**
   * 把员工的私有头像(AI 生成 / 上传,存 avatars/{工号-姓名})**提升进公共库**(管理员策展)。
   * 复制字节到 avatars/library 生成**新 fileId**(与员工原图解耦:删库条目不动员工现用头像),
   * 再复用 add() 入库(自动缩略图 + source=upload)。
   */
  async promoteFromFile(
    dto: { sourceFileId: string; name?: string; gender?: string },
    actor: ActorCtx,
  ): Promise<AvatarLibraryItemView> {
    const meta = await this.storage.getMeta(dto.sourceFileId); // 不存在/软删 → NotFound
    if (!meta.mimeType.startsWith('image/')) {
      throw new BadRequestException('只能提升图片文件');
    }
    const folder = meta.folder ?? '';
    // 源须是员工头像文件(ownerModule=user + avatars/ 下),且非库文件本身(库文件直接 add 即可)
    if (
      meta.ownerModule !== 'user' ||
      !folder.includes('avatars') ||
      folder === AVATAR_LIBRARY_FOLDER ||
      folder.startsWith(`${AVATAR_LIBRARY_FOLDER}/`)
    ) {
      throw new BadRequestException('只能提升员工头像文件(avatars/ 下、非公共库文件)');
    }

    const { buffer } = await this.storage.getBuffer(dto.sourceFileId);
    const ext = /\.([a-z0-9]+)$/i.exec(meta.originalName)?.[1] ?? 'jpg';
    const name = (dto.name?.trim() || meta.originalName.replace(/\.[a-z0-9]+$/i, '')).slice(0, 80);
    const copied = await this.storage.put(
      {
        buffer,
        originalName: `${name}.${ext}`,
        mimeType: meta.mimeType,
        ownerModule: 'user',
        folder: AVATAR_LIBRARY_FOLDER,
        visibility: 'public',
        createdById: actor.actorId,
      },
      actor,
    );
    try {
      // 复用 add(新 fileId 不会撞唯一;内部生成缩略图)
      return await this.add({ fileId: copied.id, name, gender: dto.gender }, actor);
    } catch (e) {
      // add 失败 → 清掉刚复制的原图,避免孤儿(avatars/* 被 GC 豁免,残留即永久泄漏)
      await this.storage.softDelete(copied.id, actor).catch(() => undefined);
      throw e;
    }
  }

  /**
   * 「在用」storage fileId 自报(孤儿 GC 用,MaintenanceService 聚合)。
   * ⚠ 当前 avatars/* 图片同时被 orphanCandidates 的文件夹豁免罩着(个人头像无业务表引用,只能按夹豁免);
   * 本表是逐条引用,自报后即使将来收紧文件夹豁免,库文件也不会沦为孤儿候选被 purge。
   */
  async collectInUseFileIds(): Promise<Set<string>> {
    const rows = await this.prisma.avatarLibraryItem.findMany({
      select: { fileId: true, thumbFileId: true, popFileId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.fileId);
      if (r.thumbFileId) ids.add(r.thumbFileId);
      if (r.popFileId && r.popFileId !== POP_NONE) ids.add(r.popFileId);
    }
    // 个人头像的抠像(懒生成映射)同样自报在用
    const pops = await this.prisma.avatarPopCutout.findMany({ select: { popFileId: true } });
    for (const p of pops) if (p.popFileId !== POP_NONE) ids.add(p.popFileId);
    return ids;
  }
}
