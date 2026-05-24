import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import {
  DEFAULT_SITE_SETTINGS,
  SITE_SETTING_ID,
  SiteSettingsData,
} from './site-setting.constants';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

@Injectable()
export class SiteSettingService implements OnModuleInit {
  private readonly logger = new Logger(SiteSettingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 启动时确保数据库有默认行 */
  async onModuleInit() {
    const exist = await this.prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
    });
    if (!exist) {
      await this.prisma.siteSetting.create({
        data: {
          id: SITE_SETTING_ID,
          data: JSON.stringify(DEFAULT_SITE_SETTINGS),
        },
      });
      this.logger.log('Inserted default site settings');
    }
  }

  /** 获取当前配置(任何字段缺失会合并默认值) */
  async get(): Promise<SiteSettingsData> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
    });
    if (!row) {
      // 兜底:onModuleInit 应已建好,但不依赖
      return DEFAULT_SITE_SETTINGS;
    }
    try {
      const parsed = JSON.parse(row.data) as Partial<SiteSettingsData>;
      // 与默认值合并,新增字段后老数据不会缺
      return mergeWithDefaults(parsed);
    } catch (err) {
      this.logger.error('Failed to parse site_setting.data, falling back to defaults', err);
      return DEFAULT_SITE_SETTINGS;
    }
  }

  /** 整体更新(替换式) */
  async update(data: SiteSettingsData, ctx: AuditCtx): Promise<SiteSettingsData> {
    await this.prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: {
        id: SITE_SETTING_ID,
        data: JSON.stringify(data),
      },
      update: {
        data: JSON.stringify(data),
      },
    });

    await this.audit.log({
      action: 'site.settings.update',
      target: SITE_SETTING_ID,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        brandTitle: data.brand.title,
        themePrimary: data.theme.primary,
      }),
    });

    return data;
  }
}

/** 把库里的部分对象与默认值合并,确保所有字段都齐 */
function mergeWithDefaults(part: Partial<SiteSettingsData>): SiteSettingsData {
  return {
    brand: { ...DEFAULT_SITE_SETTINGS.brand, ...(part.brand ?? {}) },
    hero: { ...DEFAULT_SITE_SETTINGS.hero, ...(part.hero ?? {}) },
    footer: {
      ...DEFAULT_SITE_SETTINGS.footer,
      ...(part.footer ?? {}),
      // friendLinks 是数组,直接覆盖而不是 spread
      friendLinks: part.footer?.friendLinks ?? DEFAULT_SITE_SETTINGS.footer.friendLinks,
    },
    topNav: {
      // items 数组直接覆盖,缺失时回默认 5 项
      items: part.topNav?.items ?? DEFAULT_SITE_SETTINGS.topNav.items,
    },
    theme: { ...DEFAULT_SITE_SETTINGS.theme, ...(part.theme ?? {}) },
  };
}
