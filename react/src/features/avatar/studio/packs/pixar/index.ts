import type { StudioGender, StudioVariant, StylePack } from "../../types";

/**
 * 「3D 卡通写实」风格包。
 * 素材由 avatar-pipeline/gen-parts.mjs 生产(定稿基准 i2i「只改X其余不变」→ 差分提取 → 清理 → webp),
 * 全画布 1024 同坐标系零偏移直叠;文件名约定 `<gender>__<slot>__<variant>.webp`。
 *
 * 加变体 = gen-parts PARTS 加一行 → 跑脚本 → cp out/*.webp 到 ./assets/ → 下方 VARIANTS 登记一行;
 * 资产经 import.meta.glob 构建期收集,登记了但素材未落地的变体自动隐藏(dev 控制台告警),支持分批量产。
 * 基准头定稿与逐字提示词见 avatar-pipeline/README.md(⚠ 换基准头 = 全部部件重生成)。
 */
const ASSET_URLS = import.meta.glob("./assets/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

function assetOf(name: string): string | null {
  return ASSET_URLS[`./assets/${name}.webp`] ?? null;
}

type VariantDef = [id: string, label: string];

/** 变体登记表:槽位 → 性别 → [id, 中文名] */
const VARIANTS: Record<string, Partial<Record<StudioGender, VariantDef[]>>> = {
  hair: {
    male: [
      ["short-black", "黑色短发"],
      ["curly-brown", "棕色卷发"],
      ["buzz", "寸头"],
      ["side-part", "三七分"],
      ["spiky", "碎发刺头"],
      ["curtain-brown", "棕色中分"],
      ["slicked", "油头背头"],
      ["fluffy", "蓬松短发"],
      ["gray-short", "灰白短发"],
      ["perm", "小卷烫发"],
      ["undercut", "两侧铲短"],
      ["messy-brown", "凌乱短发"],
    ],
    female: [
      ["bob-brown", "齐肩直发"],
      ["bun-black", "丸子头"],
      ["ponytail-brown", "高马尾"],
      ["long-straight", "黑长直"],
      ["short-bob", "波波头"],
      ["curly-long", "大波浪"],
      ["double-bun", "双丸子头"],
      ["low-ponytail", "低马尾"],
      ["pixie", "精灵短发"],
      ["shoulder-curl", "齐肩内扣"],
      ["braid", "麻花辫"],
      ["gray-bun", "灰白发髻"],
    ],
  },
  eyes: {
    male: [
      ["smile", "眯眯笑眼"],
      ["closed", "闭眼"],
      ["single-lid", "单眼皮"],
    ],
    female: [
      ["smile", "眯眯笑眼"],
      ["closed", "闭眼"],
      ["single-lid", "单眼皮"],
      ["wink", "单眼眨眼"],
    ],
  },
  brows: {
    male: [
      ["thick", "粗剑眉"],
      ["raised", "挑眉"],
    ],
    female: [
      ["thin", "柳叶眉"],
      ["straight", "一字眉"],
    ],
  },
  mouth: {
    // ⚠ 「惊讶张口 o」已下架:O 嘴与基准深笑纹是病理组合(补丁边界总穿过旧唇纹留残线),
    // 素材与管线条目保留,待 P3 用 5.0 pro 框选编辑重做后再登记
    male: [
      ["laugh", "开怀大笑"],
      ["grin", "抿嘴浅笑"],
    ],
    female: [
      ["laugh", "开怀大笑"],
      ["grin", "抿嘴浅笑"],
    ],
  },
  nose: {
    male: [["button", "小圆鼻"]],
    female: [["button", "小圆鼻"]],
  },
  beard: {
    male: [
      ["stubble", "络腮短胡"],
      ["goatee", "山羊胡"],
      ["mustache", "八字胡"],
      ["full", "大胡子"],
    ],
  },
  glasses: {
    male: [
      ["round-black", "黑圆框"],
      ["square-black", "黑方框"],
      ["half-rim", "金属半框"],
      ["rimless", "无框眼镜"],
      ["sunglasses", "墨镜"],
    ],
    female: [
      ["round-black", "黑圆框"],
      ["square-red", "酒红方框"],
      ["sunglasses", "墨镜"],
    ],
  },
  clothes: {
    male: [
      ["white-shirt", "白衬衫"],
      ["suit", "西装领带"],
      ["workwear", "藏蓝工装"],
      ["polo-red", "红色POLO"],
      ["hoodie-gray", "灰色卫衣"],
      ["tshirt-white", "白色T恤"],
    ],
    female: [
      ["white-shirt", "白衬衫"],
      ["suit", "西装套装"],
      ["red-blouse", "红色衬衫"],
      ["workwear", "藏蓝工装"],
      ["sweater", "米色毛衣"],
      ["tshirt-blue", "浅蓝T恤"],
    ],
  },
  accessory: {
    female: [
      ["earrings-gold", "金色耳环"],
      ["earrings-pearl", "珍珠耳钉"],
      ["red-scarf", "红色丝巾"],
    ],
  },
};

function buildVariants(slot: string): StudioVariant[] {
  const out: StudioVariant[] = [];
  for (const gender of ["male", "female"] as const) {
    for (const [id, label] of VARIANTS[slot]?.[gender] ?? []) {
      const src = assetOf(`${gender}__${slot}__${id}`);
      if (!src) {
        // 登记了但素材未落地(分批量产中)→ 隐藏,不阻塞
        if (import.meta.env.DEV) console.warn(`[avatar-studio] 缺素材 ${gender}__${slot}__${id}.webp,暂不上架`);
        continue;
      }
      out.push({ id, label, gender, src });
    }
  }
  return out;
}

function mustAsset(name: string): string {
  const src = assetOf(name);
  if (!src) throw new Error(`[avatar-studio] 缺基准图 ${name}.webp`);
  return src;
}

/**
 * z 序约定:基准 0 < 衣服 10 < 嘴 15 < 鼻 16 < 眼 17 < 眉 18 < 胡子 20 < 饰品 28 < 发型 30 < 眼镜 40。
 * 五官替换件带"皮肤补丁"须贴基准脸(最低层);嘴在胡子下(大笑嘴被胡型开口自然遮边);
 * 耳环在发型下(长发盖耳时被遮是真实行为);刘海盖眉、墨镜盖眼靠层序天然成立。
 */
export const pixarPack: StylePack = {
  id: "pixar",
  label: "3D 卡通写实",
  canvas: 1024,
  bases: { male: mustAsset("base-male"), female: mustAsset("base-female") },
  // ⚠ noneWeight 是绝对权重,与变体池同锅抽签:P(无)=noneWeight/(池内权重和+noneWeight)。
  //   加变体会稀释「无」→ 每次扩池后按意图分布重调(意图注释在行尾,别删)。
  slots: [
    { key: "hair", label: "发型", z: 30, optional: true, noneWeight: 0.3, variants: buildVariants("hair") }, // 光头罕见
    { key: "eyes", label: "眼睛", z: 17, optional: true, noneWeight: 6, variants: buildVariants("eyes") }, // ≈2/3 默认睁眼
    { key: "brows", label: "眉毛", z: 18, optional: true, noneWeight: 5, variants: buildVariants("brows") }, // ≈2/3 默认眉
    { key: "mouth", label: "嘴巴", z: 15, optional: true, noneWeight: 4, variants: buildVariants("mouth") }, // ≈2/3 默认微笑
    { key: "nose", label: "鼻子", z: 16, optional: true, noneWeight: 5, variants: buildVariants("nose") }, // ≈5/6 默认鼻
    { key: "beard", label: "胡子", z: 20, optional: true, noneWeight: 12, variants: buildVariants("beard") }, // ≈3/4 无胡
    { key: "glasses", label: "眼镜", z: 40, optional: true, noneWeight: 8, variants: buildVariants("glasses") }, // ≈2/3 不戴镜
    { key: "clothes", label: "衣服", z: 10, optional: true, noneWeight: 1, variants: buildVariants("clothes") }, // 基准T恤也是衣服
    { key: "accessory", label: "饰品", z: 28, optional: true, noneWeight: 5, variants: buildVariants("accessory") }, // ≈5/8 无饰品
  ],
};
