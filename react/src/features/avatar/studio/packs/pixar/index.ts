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

type VariantDef = [id: string, label: string, z?: number];

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
      ["uyghur-cap", "维吾尔花帽"],
      ["shaanbei-towel", "陕北羊肚巾"],
      ["kazakh-hat", "哈萨克毡帽"],
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
      // 民族头饰+发型一体(帽/头饰/头发不好拆,按用户定案整合成发型槽变体)
      ["miao-silver", "苗族银冠"],
      ["uyghur-cap", "维吾尔花帽辫"],
      ["kazakh-hat", "哈萨克羽帽辫"],
    ],
  },
  eyes: {
    // ⚠ 「闭眼」已下架(P2.5 用户定案:头像不该闭眼,按 大小/睫毛/瞳色 调;素材与 PARTS 保留未登记)
    male: [
      ["smile", "眯眯笑眼"],
      ["single-lid", "单眼皮"],
      ["big-round", "大圆眼"],
      ["black-pupil", "黑瞳圆眼"],
      ["amber-pupil", "琥珀瞳"],
    ],
    female: [
      ["smile", "眯眯笑眼"],
      ["single-lid", "单眼皮"],
      ["wink", "单眼眨眼"],
      ["big-round", "大圆杏眼"],
      ["long-lash", "浓密长睫"],
      ["black-pupil", "黑瞳"],
      ["amber-pupil", "琥珀瞳"],
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
    male: [
      ["button", "小圆鼻"],
      ["tall", "高挺鼻梁"],
      ["broad", "宽厚鼻"],
    ],
    female: [
      ["button", "小圆鼻"],
      ["tall", "高挺鼻梁"],
      ["upturned", "小翘鼻"],
    ],
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
      ["mongol-robe", "蒙古袍"],
      ["kazakh-vest", "哈萨克坎肩"],
      ["shaanbei-shirt", "陕北布衫坎肩"],
    ],
    female: [
      ["white-shirt", "白衬衫"],
      ["suit", "西装套装"],
      ["red-blouse", "红色衬衫"],
      ["workwear", "藏蓝工装"],
      ["sweater", "米色毛衣"],
      ["tshirt-blue", "浅蓝T恤"],
      // 民族服饰(苗绣元素取自用户提示词:银项圈/银铃铛流苏/花卉绣纹)
      ["miao-dress", "苗绣短褂"],
      ["mongol-robe", "蒙古袍"],
      ["tibetan-robe", "藏袍"],
      ["kazakh-dress", "哈萨克裙装"],
    ],
  },
  accessory: {
    female: [
      ["earrings-gold", "金色耳环"],
      ["earrings-pearl", "珍珠耳钉"],
      // 丝巾 z=32 抬到发型(30)之上:长发盖丝巾会把领结切成随机红碎片(P2.4 用户图),
      // 系在发外反而是自然穿法;耳环保持发下(长发盖耳被遮是真实行为)
      ["red-scarf", "红色丝巾", 32],
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
 * z 序约定:基准 0 < 衣服 10 < 嘴 15 < 鼻 16 < 眼 17 < 眉 18 < 胡子 20 < 饰品 28 < 发型 30 < 丝巾 32 < 眼镜 40。
 * 五官替换件带"皮肤补丁"须贴基准脸(最低层);耳环在发型下(长发盖耳时被遮是真实行为);
 * 刘海盖眉、垂发盖眼角靠层序天然成立(眼试过抬到发上,闭眼补丁反咬刘海,已回滚)。
 *
 * ★类目合并(P2.3 用户定案):眼睛⊕眼镜、嘴巴⊕胡子为互斥组 —— 眼镜/胡子件由 i2i 在
 * 基准默认眉眼/嘴上生成,自带"重画的默认五官"烤定层;互斥后它们永远只叠在基准上,
 * 与生成语境一致 → 镜片浮旧瞳孔/睫毛残纹、胡×嘴穿透这两类跨层病灶整类消失。
 * 发型+饰品仅同 tab 分节,可共存。
 */
export const pixarPack: StylePack = {
  id: "pixar",
  label: "3D 卡通写实",
  canvas: 1024,
  bases: { male: mustAsset("base-male"), female: mustAsset("base-female") },
  // ⚠ noneWeight 是绝对权重,与变体池同锅抽签:P(无)=noneWeight/(池内权重和+noneWeight)。
  //   加变体会稀释「无」→ 每次扩池后按意图分布重调(意图注释在行尾,别删)。
  //   互斥组(眼睛/嘴巴)的随机用 groups[].noneWeight 联合抽签,组内槽位的 noneWeight 不参与。
  slots: [
    { key: "hair", label: "发型", z: 30, optional: true, noneWeight: 0.3, variants: buildVariants("hair") }, // 光头罕见
    // eyes 必须在发型(30)之下:垂到眼角的刘海/发丝盖住眼睛是正确物理 —— z 抬上去过一轮
    // (P2.4),闭眼补丁反咬刘海成"肤色缺口"即回滚。发件眼区私货由管线洪泛清除(见 gen-parts)
    { key: "eyes", label: "眼睛", z: 17, optional: true, noneWeight: 6, variants: buildVariants("eyes") },
    { key: "brows", label: "眉毛", z: 18, optional: true, noneWeight: 5, variants: buildVariants("brows") }, // ≈2/3 默认眉
    { key: "mouth", label: "嘴巴", z: 15, optional: true, noneWeight: 4, variants: buildVariants("mouth") },
    { key: "nose", label: "鼻子", z: 16, optional: true, noneWeight: 5, variants: buildVariants("nose") }, // ≈5/8 默认鼻
    { key: "beard", label: "胡子", z: 20, optional: true, noneWeight: 12, variants: buildVariants("beard") },
    { key: "glasses", label: "眼镜", z: 40, optional: true, noneWeight: 8, variants: buildVariants("glasses") },
    { key: "clothes", label: "衣服", z: 10, optional: true, noneWeight: 1, variants: buildVariants("clothes") }, // 基准T恤也是衣服
    { key: "accessory", label: "饰品", z: 28, optional: true, noneWeight: 5, variants: buildVariants("accessory") }, // ≈5/8 无饰品
  ],
  groups: [
    { key: "hair", label: "发型", slots: ["hair", "accessory"] }, // 发型+头饰同 tab,可共存
    // 男 3眼+5镜 / 女 4眼+3镜,none 10 → ≈55% 默认睁眼、其余眼睛/眼镜按池分摊
    { key: "eyes", label: "眼睛", slots: ["eyes", "glasses"], exclusive: true, noneWeight: 10 },
    { key: "brows", label: "眉毛", slots: ["brows"] },
    // 男 2嘴+4胡 / 女 2嘴,none 8 → 男≈57% 默认微笑、胡 29%、嘴 14%;女 80% 默认
    { key: "mouth", label: "嘴巴", slots: ["mouth", "beard"], exclusive: true, noneWeight: 8 },
    { key: "nose", label: "鼻子", slots: ["nose"] },
    { key: "clothes", label: "衣服", slots: ["clothes"] },
  ],
};
