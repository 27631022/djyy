import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
import { PrismaService } from '../prisma';
import { StorageService } from '../storage';
import { ExternalApiService } from '../external-api';
import { AuditService } from '../audit';
import { PromptService } from '../prompt';
import { AVATAR_LIBRARY_FOLDER, AvatarLibraryService } from './avatar-library.service';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

export interface AvatarGenerateResult {
  /** 生成头像存入 storage 后的 fileId(确认后用它设为用户头像) */
  fileId: string;
  /** 公开可访问的头像 URL(相对 API,前端按推断 base 拼;免登录持久) */
  url: string;
  /** 实际用到的 provider / model(便于排错 + 计费溯源) */
  provider: string;
  model: string;
}

/** data:URL 里 base64 头几字节判图片真实格式(SeedEdit 回 b64 时落盘用对扩展名)。 */
function sniffImage(b64: string): { ext: string; mime: string } {
  if (b64.startsWith('/9j/')) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b64.startsWith('iVBOR')) return { ext: 'png', mime: 'image/png' };
  if (b64.startsWith('UklGR')) return { ext: 'webp', mime: 'image/webp' };
  return { ext: 'jpg', mime: 'image/jpeg' };
}

/**
 * 头像业务文件夹 —— 每个用户一个,挂载群晖后在 File Station 里按「员工编号-姓名」可浏览:
 * `avatars/{员工编号}-{姓名}`(原图 + 历次生成头像都在里面)。缺姓名/工号则平铺 `avatars`。
 */
function avatarFolder(name?: string, emp?: string): string {
  return name && emp ? `avatars/${emp}-${name}` : 'avatars';
}

/**
 * 头像 AI 生成 —— 上传本人照片,经「图像编辑(image-to-image)」模型生成职场头像。
 *
 * provider/model 走 external-api 的 `user.avatar.generate` 消费点(按优先级自动选,需配 imageModel + image 能力)。
 * 调用 OpenAI 兼容的图像生成端点 `${apiUrl}/images/generations`(火山方舟 SeedEdit / 即梦同款),
 * 照片以 base64 data:URL 传 `image`(局域网后端→云,不依赖照片有公网 URL)。结果存 storage,返回预览 fileId + 公开 URL。
 * 不直接改 User.avatarUrl —— 让用户预览确认后再设(走 users.update)。
 */
@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly externalApi: ExternalApiService,
    private readonly audit: AuditService,
    private readonly prompts: PromptService,
    private readonly library: AvatarLibraryService,
  ) {}

  async generate(
    photoFileId: string,
    actor: ActorCtx,
    opts?: { prompt?: string; targetName?: string; employeeNumber?: string },
  ): Promise<AvatarGenerateResult> {
    if (!photoFileId) throw new BadRequestException('缺少照片 fileId');

    // 1. 解析图像生成 provider(按优先级 / 路由绑定)
    const cfg = await this.externalApi.getConfigForConsumer('user.avatar.generate');
    if (!cfg) {
      throw new BadRequestException(
        '未找到可用的「图像生成」模型。请到「AI 接入管理」给某个平台(如豆包/火山)勾选 image 能力 + 填写 imageModel(如 doubao-seedream-5-0-260128),并配好 Key。',
      );
    }
    if (!cfg.model) {
      throw new BadRequestException(
        `平台「${cfg.provider}」已标 image 能力但未填 imageModel(图生图模型),无法生成。请在「AI 接入管理」补上 imageModel。`,
      );
    }
    if (!cfg.apiUrl) {
      throw new BadRequestException(`平台「${cfg.provider}」未配置 endpoint(apiUrl)`);
    }

    // 2. 取出上传的照片 → base64 data:URL
    const photo = await this.storage.getBuffer(photoFileId);
    if (!photo.meta.mimeType.startsWith('image/')) {
      throw new BadRequestException('上传的不是图片文件');
    }
    const imageDataUrl = `data:${photo.meta.mimeType};base64,${photo.buffer.toString('base64')}`;
    const prompt =
      (opts?.prompt && opts.prompt.trim()) || (await this.prompts.get('avatar.generate'));

    // 3. 调图生图端点(OpenAI 兼容 images/generations;火山 SeedEdit / 即梦)
    const apiUrl = cfg.apiUrl.replace(/\/+$/, '');
    const started = Date.now();
    let imgData: { b64_json?: string; url?: string };
    try {
      const resp = await axios.post(
        `${apiUrl}/images/generations`,
        {
          model: cfg.model,
          prompt,
          image: imageDataUrl, // 图生图:输入照片(base64 data:URL,局域网不依赖公网图)
          sequential_image_generation: 'disabled', // 只出单图(Seedream 5.0 需显式关组图)
          response_format: 'url', // Seedream 5.0 实测回 url(服务第 4 步会回源下载存 storage)
          size: '2K', // Seedream 5.0 用 1K/2K/4K,不认 adaptive
          watermark: false, // 关水印(火山默认带)
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          timeout: 120_000, // 图生图较慢
        },
      );
      imgData = resp.data?.data?.[0] ?? {};
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string }; message?: string }>;
      const msg =
        err.response?.data?.error?.message ??
        err.response?.data?.message ??
        err.message ??
        '未知错误';
      this.logger.warn(`头像生成失败 provider=${cfg.provider} model=${cfg.model}: ${msg}`);
      await this.audit.log({
        action: 'avatar.generate',
        target: photoFileId,
        ...actor,
        detail: JSON.stringify({ ok: false, provider: cfg.provider, model: cfg.model, msg }),
      });
      throw new BadRequestException(`AI 生成头像失败:${msg}`);
    }
    const resultB64 = imgData.b64_json ?? null;
    const resultUrl = imgData.url ?? null;

    // 4. 拿到结果图字节(b64 直接解;否则回源拉 url)
    let outBuf: Buffer;
    let ext = 'jpg';
    let mime = 'image/jpeg';
    if (resultB64) {
      const sniff = sniffImage(resultB64);
      ext = sniff.ext;
      mime = sniff.mime;
      outBuf = Buffer.from(resultB64, 'base64');
    } else if (resultUrl) {
      const img = await axios.get<ArrayBuffer>(resultUrl, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      });
      outBuf = Buffer.from(img.data);
      const ct = String(img.headers['content-type'] ?? '');
      if (ct.includes('png')) {
        ext = 'png';
        mime = 'image/png';
      } else if (ct.includes('webp')) {
        ext = 'webp';
        mime = 'image/webp';
      }
    } else {
      throw new BadRequestException('AI 返回为空(既无 b64_json 也无 url)');
    }

    // 5. 结果存 storage(业务文件夹 user/avatars,public 可见)
    const stored = await this.storage.put(
      {
        buffer: outBuf,
        // 文件名带姓名,落在 avatars/{工号}-{姓名}/ 文件夹;撞名 storage 自动加 -2/-3(历次生成都留)
        originalName: opts?.targetName
          ? `${opts.targetName}-头像.${ext}`
          : `avatar-${actor.actorId ?? 'user'}.${ext}`,
        mimeType: mime,
        ownerModule: 'user',
        folder: avatarFolder(opts?.targetName, opts?.employeeNumber),
        visibility: 'public',
        createdById: actor.actorId,
      },
      actor,
    );

    await this.audit.log({
      action: 'avatar.generate',
      target: stored.id,
      ...actor,
      detail: JSON.stringify({
        ok: true,
        provider: cfg.provider,
        model: cfg.model,
        photoFileId,
        ms: Date.now() - started,
      }),
    });

    return {
      fileId: stored.id,
      url: `/api/public/avatars/${stored.id}`,
      provider: cfg.provider,
      model: cfg.model,
    };
  }

  /**
   * 某用户的历史 AI 头像(「从历史头像库挑选」用,不必重新生成)。
   * 按 avatars/{员工编号}-{姓名} 文件夹列含「头像」的文件,新→旧。
   */
  async listHistory(opts: {
    name?: string;
    employeeNumber?: string;
  }): Promise<{ fileId: string; url: string; originalName: string; createdAt: Date }[]> {
    const metas = await this.storage.list({
      ownerModule: 'user',
      folder: avatarFolder(opts.name, opts.employeeNumber),
      originalNameContains: '头像',
      limit: 30,
    });
    return metas.map((m) => ({
      fileId: m.id,
      url: `/api/public/avatars/${m.id}`,
      originalName: m.originalName,
      createdAt: m.createdAt,
    }));
  }

  /**
   * 删除历史头像库里的一个文件(本人删自己文件夹的 / avatar:manage 可删任何人的)。
   * 守卫:公共库文件不走此口(头像工坊管理);**正在被使用的头像拒删**(User.avatarUrl /
   * 互动 "u:" 引用 —— 删了全站头像就裂,提示先更换);联动清派生的弹出抠像(映射行 + 文件)。
   */
  async removeHistory(
    fileId: string,
    actor: ActorCtx,
    scope: { name?: string; username?: string; canManage: boolean },
  ): Promise<{ ok: true }> {
    const meta = await this.storage.getMeta(fileId); // 不存在/软删 → NotFound
    const folder = meta.folder ?? '';
    if (meta.ownerModule !== 'user' || !folder.startsWith('avatars')) {
      throw new BadRequestException('不是头像文件');
    }
    if (folder === AVATAR_LIBRARY_FOLDER || folder.startsWith(`${AVATAR_LIBRARY_FOLDER}/`)) {
      throw new BadRequestException('公共头像库文件请到「头像工坊」里管理');
    }
    const ownFolder = avatarFolder(scope.name, scope.username);
    if (!scope.canManage && folder !== ownFolder) {
      throw new ForbiddenException('只能删除自己头像库中的文件');
    }
    // 在用校验(照头像工坊 remove 的交叉校验惯例):当前被任何用户/互动玩家引用 → 拒删
    const [userRefs, playerRefs] = await Promise.all([
      this.prisma.user.count({ where: { avatarUrl: { contains: fileId } } }),
      this.prisma.interactivePlayer.count({ where: { avatar: `u:${fileId}` } }),
    ]);
    if (userRefs + playerRefs > 0) {
      throw new ConflictException('该头像正在被使用(当前头像/现场互动),请先更换后再删除');
    }
    await this.library.dropPersonalPop(fileId, actor); // 派生抠像联动清
    await this.storage.softDelete(fileId, actor);
    await this.audit.log({
      action: 'avatar.history.remove',
      target: fileId,
      ...actor,
      detail: JSON.stringify({ folder, originalName: meta.originalName, canManage: scope.canManage }),
    });
    return { ok: true };
  }

  /**
   * 管理员总览:所有员工的生成头像(私有头像汇总,供浏览 + 提升到公共库)。
   * 生成头像 originalName 含「头像」(落名 `{姓名}-头像.ext`),公共库文件名是 avatar-XXX-性别
   * 不含「头像」→ 天然排除;再按 folder 双保险排除 avatars/library。
   * ⚠ storage.list 硬上限 200,当前生成头像仅十几个;将来量大需给 storage 加前缀分页。
   */
  async listGenerated(): Promise<
    { fileId: string; url: string; originalName: string; folder: string; createdAt: Date }[]
  > {
    const metas = await this.storage.list({
      ownerModule: 'user',
      originalNameContains: '头像',
      limit: 200,
    });
    return metas
      .filter((m) => !(m.folder ?? '').startsWith('avatars/library'))
      .map((m) => ({
        fileId: m.id,
        url: `/api/public/avatars/${m.id}`,
        originalName: m.originalName,
        folder: m.folder ?? '',
        createdAt: m.createdAt,
      }));
  }
}
