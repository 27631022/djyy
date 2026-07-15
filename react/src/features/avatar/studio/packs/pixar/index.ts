import type { StylePack } from "../../types";
import baseMale from "./assets/base-male.webp";
import baseFemale from "./assets/base-female.webp";
import mHairShortBlack from "./assets/male__hair__short-black.webp";
import mHairCurlyBrown from "./assets/male__hair__curly-brown.webp";
import mHairBuzz from "./assets/male__hair__buzz.webp";
import mGlassesRoundBlack from "./assets/male__glasses__round-black.webp";
import mBeardStubble from "./assets/male__beard__stubble.webp";
import fHairBobBrown from "./assets/female__hair__bob-brown.webp";
import fHairBunBlack from "./assets/female__hair__bun-black.webp";
import fHairPonytailBrown from "./assets/female__hair__ponytail-brown.webp";

/**
 * 「3D 卡通写实」风格包(P1 开发小批次:男5+女3 部件)。
 * 素材生产 = avatar-pipeline/gen-parts.mjs(定稿基准 i2i「只改X其余不变」→ 差分提取 → 去斑 → webp),
 * 全画布 1024 同坐标系,零偏移直叠。加变体 = 生产脚本加一行 → 复制 webp → 此处 variants 加一项。
 * 基准头定稿与逐字提示词见 avatar-pipeline/README.md(基准一换全部部件需重生成)。
 */
export const pixarPack: StylePack = {
  id: "pixar",
  label: "3D 卡通写实",
  canvas: 1024,
  bases: { male: baseMale, female: baseFemale },
  slots: [
    {
      key: "beard",
      label: "胡子",
      z: 20,
      optional: true,
      noneWeight: 3, // 随机时 3/4 概率无胡子
      variants: [{ id: "stubble", label: "络腮短胡", gender: "male", src: mBeardStubble }],
    },
    {
      key: "hair",
      label: "发型",
      z: 30,
      optional: true,
      noneWeight: 0.3, // 随机偶尔光头
      variants: [
        { id: "short-black", label: "黑色短发", gender: "male", src: mHairShortBlack },
        { id: "curly-brown", label: "棕色卷发", gender: "male", src: mHairCurlyBrown },
        { id: "buzz", label: "寸头", gender: "male", src: mHairBuzz },
        { id: "bob-brown", label: "齐肩直发", gender: "female", src: fHairBobBrown },
        { id: "bun-black", label: "丸子头", gender: "female", src: fHairBunBlack },
        { id: "ponytail-brown", label: "高马尾", gender: "female", src: fHairPonytailBrown },
      ],
    },
    {
      key: "glasses",
      label: "眼镜",
      z: 40,
      optional: true,
      noneWeight: 2,
      variants: [
        { id: "round-black", label: "黑圆框眼镜", gender: "male", src: mGlassesRoundBlack },
      ],
    },
  ],
};
