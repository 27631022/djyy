// 部件生产:定稿基准头 i2i「只改X其余不变」→ 与基准差分提取 → 去斑 → 1024 全画布 webp 部件
// 用法: ARK_KEY=<key> [ARK_MODEL=<model>] node gen-parts.mjs [gen|extract|all]
// 产物: raw/ (i2i 原图 png) + out/ (提取的部件 webp + 基准 webp)
// 部件放进前端 = 复制 out/*.webp 到 react/src/features/avatar/studio/packs/<pack>/assets/ 并在 manifest 注册
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('D:/web/djyy/backend/package.json');
const axios = require('axios');
const sharp = require('sharp');

const KEY = process.env.ARK_KEY;
const MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-260128';
const API = 'https://ark.cn-beijing.volces.com/api/v3';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASES = path.join(HERE, 'bases');
const RAW = path.join(HERE, 'raw');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const STYLE = ',与画面整体3D卡通风格一致';
/** 加物类(发型/眼镜/胡子/饰品):全部保持,只加 X */
const KEEP =
  '保持画面中人物的脸型、五官、表情、肤色、衣服、姿势、身体比例、光照和纯绿色背景完全不变,';
/** 五官替换类:除目标五官外全部保持 */
const KEEP_FACE =
  '保持画面中人物的脸型、肤色、衣服、姿势、身体比例、光照和纯绿色背景完全不变,除下述目标外的其它五官也保持完全不变,';
/** 换装类:头部全保持,只换上衣 */
const KEEP_CLOTH =
  '保持画面中人物的头部(脸型、五官、表情、肤色、光头)、脖子、姿势、身体比例、光照和纯绿色背景完全不变,';

/** 部件清单:id = <gender>/<slot>/<variant>(加部件 = 此处加一行 → 跑脚本 → cp webp → manifest 一项) */
const PARTS = [
  // ============ 男 · 发型(加物) ============
  { id: 'male/hair/short-black', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色短发${STYLE}` },
  { id: 'male/hair/curly-brown', base: 'base-male', prompt: `${KEEP}只给他加上一头棕色微卷中分短发${STYLE}` },
  { id: 'male/hair/buzz', base: 'base-male', prompt: `${KEEP}只给他加上一头利落的黑色寸头(极短的贴头皮短发)${STYLE}` },
  { id: 'male/hair/side-part', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色三七分短发(侧分,整齐服帖)${STYLE}` },
  { id: 'male/hair/spiky', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色碎发短刺头(发尖微微立起)${STYLE}` },
  { id: 'male/hair/curtain-brown', base: 'base-male', prompt: `${KEEP}只给他加上一头棕色中分刘海短发(两侧刘海自然垂下)${STYLE}` },
  { id: 'male/hair/slicked', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色向后梳的油头背头${STYLE}` },
  { id: 'male/hair/fluffy', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色自然蓬松短发${STYLE}` },
  // 发际线要求:上一版 raw 在顶部发际画了"绿幕混稀疏碎发"的糊边,提取成灰泥斑(P2.3 重生成)
  { id: 'male/hair/gray-short', base: 'base-male', prompt: `${KEEP}只给他加上一头灰白色的整齐短发(年长者发色),发际线边缘干净利落、不要稀疏碎发${STYLE}` },
  { id: 'male/hair/perm', base: 'base-male', prompt: `${KEEP}只给他加上一头黑色小卷烫发短发${STYLE}` },
  { id: 'male/hair/undercut', base: 'base-male', prompt: `${KEEP}只给他加上两侧铲短、顶部较长的黑色短发(undercut)${STYLE}` },
  { id: 'male/hair/messy-brown', base: 'base-male', prompt: `${KEEP}只给他加上一头棕色凌乱感短发${STYLE}` },
  // ============ 男 · 民族头饰(帽+发一体) ============
  { id: 'male/hair/shaanbei-towel', base: 'base-male', prompt: `${KEEP}只给他的头上包一条陕北白羊肚毛巾(白毛巾包头、结在额前,不遮挡眉毛眼睛,脸部完全不变)${STYLE}` },
  { id: 'male/hair/kazakh-hat', base: 'base-male', prompt: `${KEEP}只给他戴上一顶哈萨克族白色毡帽(帽檐上卷带黑色绒边,戴在头顶,不遮挡眉毛眼睛,脸部完全不变)${STYLE}` },
  // ⚠ 首版"加短发并戴帽"改动过大,i2i 连整张脸都重画了(脸补丁浮在基准上);改成只戴帽
  { id: 'male/hair/uyghur-cap', base: 'base-male', prompt: `${KEEP}只给他戴上一顶维吾尔族绣花小花帽(朵帕,黑底彩绣四棱小帽,戴在头顶,不遮挡眉毛眼睛,脸部完全不变)${STYLE}` },
  // ============ 男 · 眼镜(加物) ============
  { id: 'male/glasses/round-black', base: 'base-male', eyeMode: 'clear', prompt: `${KEEP}只给他戴上一副黑色圆框眼镜${STYLE}` },
  { id: 'male/glasses/square-black', base: 'base-male', eyeMode: 'clear', prompt: `${KEEP}只给他戴上一副黑色方框眼镜${STYLE}` },
  { id: 'male/glasses/half-rim', base: 'base-male', eyeMode: 'clear', prompt: `${KEEP}只给他戴上一副金属细半框眼镜${STYLE}` },
  { id: 'male/glasses/rimless', base: 'base-male', eyeMode: 'clear', prompt: `${KEEP}只给他戴上一副无框透明眼镜${STYLE}` },
  { id: 'male/glasses/sunglasses', base: 'base-male', eyeMode: 'cover', prompt: `${KEEP}只给他戴上一副黑色墨镜(深色镜片太阳镜)${STYLE}` },
  // ============ 男 · 胡子(加物) ============
  { id: 'male/beard/stubble', base: 'base-male', prompt: `${KEEP}只给他加上短短的络腮胡${STYLE}` },
  { id: 'male/beard/goatee', base: 'base-male', prompt: `${KEEP}只给他加上下巴上的山羊胡${STYLE}` },
  { id: 'male/beard/mustache', base: 'base-male', prompt: `${KEEP}只给他加上嘴唇上方的八字胡${STYLE}` },
  { id: 'male/beard/full', base: 'base-male', prompt: `${KEEP}只给他加上浓密的深棕色络腮大胡子${STYLE}` },
  // ============ 男 · 衣服(替换) ============
  { id: 'male/clothes/white-shirt', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成白色衬衫${STYLE}` },
  { id: 'male/clothes/suit', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成深色西装、白衬衫和领带${STYLE}` },
  { id: 'male/clothes/workwear', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成藏蓝色工装外套${STYLE}` },
  { id: 'male/clothes/polo-red', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成红色POLO衫${STYLE}` },
  { id: 'male/clothes/hoodie-gray', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成灰色连帽卫衣${STYLE}` },
  { id: 'male/clothes/tshirt-white', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成白色圆领T恤${STYLE}` },
  // ============ 男 · 民族服饰(换装) ============
  // ⚠ 前两版领口开得比基准T恤低,i2i 补画脖子皮肤(强差分,剪哪儿都露楔形)→ 高立领贴颈,不给它补脖子的机会
  { id: 'male/clothes/mongol-robe', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成蒙古族高立领长袍上衣(藏青色缎面、金色镶边盘扣、橙色腰带),高立领紧贴脖颈、领口高度与原上衣一致,脖子和头部完全不变${STYLE}` },
  { id: 'male/clothes/kazakh-vest', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成哈萨克族男式服装(白色立领衬衫外套深色绣金纹坎肩),领口高度与原上衣一致,脖子和头部完全不变${STYLE}` },
  { id: 'male/clothes/shaanbei-shirt', base: 'base-male', prompt: `${KEEP_CLOTH}只把他的上衣换成陕北农民装束(白色对襟布衫外套深色羊毛坎肩),领口高度与原上衣一致,脖子和头部完全不变${STYLE}` },
  // ============ 男 · 五官(替换,试产先行) ============
  { id: 'male/eyes/smile', base: 'base-male', prompt: `${KEEP_FACE}只把他的眼睛改成开心的眯眯笑眼(两条向下弯的弧线,闭着笑),眉毛保持原样${STYLE}` },
  // 眼睑要求:上一版 raw 在左眼内眼角画了白色泪光杂块(P2.3 重生成)
  { id: 'male/eyes/closed', base: 'base-male', prompt: `${KEEP_FACE}只把他的眼睛改成安静闭上的眼睛(两条平滑的闭眼弧线),眼睑皮肤干净光滑、不要泪光高光杂点,眉毛保持原样${STYLE}` },
  { id: 'male/eyes/single-lid', base: 'base-male', prompt: `${KEEP_FACE}只把他的眼睛改成细长的单眼皮眼睛,眉毛保持原样${STYLE}` },
  // 眼睛新维度(P2.5 用户定案:不用闭眼,按 大小/睫毛/瞳色 调):
  { id: 'male/eyes/big-round', base: 'base-male', prompt: `${KEEP_FACE}只把他的眼睛改成更大更圆的有神大眼睛(睁开直视前方),眉毛保持原样${STYLE}` },
  { id: 'male/eyes/black-pupil', base: 'base-male', prompt: `${KEEP_FACE}只把他的瞳孔虹膜颜色改成深黑色,眼睛形状大小完全不变,眉毛保持原样${STYLE}` },
  { id: 'male/eyes/amber-pupil', base: 'base-male', prompt: `${KEEP_FACE}只把他的瞳孔虹膜颜色改成浅琥珀棕色,眼睛形状大小完全不变,眉毛保持原样${STYLE}` },
  { id: 'male/mouth/laugh', base: 'base-male', prompt: `${KEEP_FACE}只把他的嘴巴改成开心大笑张开的嘴(露出上排牙齿)${STYLE}` },
  // ⚠ O嘴要锁死下巴:张大口会带动整个下半脸变形,差分补丁覆盖半张脸,边界穿过旧唇纹留残线
  { id: 'male/mouth/o', base: 'base-male', prompt: `${KEEP_FACE}只把他的嘴唇轻轻微张成一个小小的O形惊讶嘴(幅度很小,下巴、脸部轮廓和面部其他部分完全保持不变)${STYLE}` },
  { id: 'male/mouth/grin', base: 'base-male', prompt: `${KEEP_FACE}只把他的嘴巴改成抿着嘴的浅笑${STYLE}` },
  { id: 'male/brows/thick', base: 'base-male', prompt: `${KEEP_FACE}只把他的眉毛改成粗浓的剑眉${STYLE}` },
  { id: 'male/brows/raised', base: 'base-male', prompt: `${KEEP_FACE}只把他的眉毛改成一边挑起的挑眉${STYLE}` },
  { id: 'male/nose/button', base: 'base-male', prompt: `${KEEP_FACE}只把他的鼻子改成小巧的圆鼻头${STYLE}` },
  { id: 'male/nose/tall', base: 'base-male', prompt: `${KEEP_FACE}只把他的鼻子改成高挺立体的高鼻梁(鼻梁挺直突出)${STYLE}` },
  { id: 'male/nose/broad', base: 'base-male', prompt: `${KEEP_FACE}只把他的鼻子改成鼻头稍宽厚的宽鼻子${STYLE}` },
  // ============ 女 · 发型(加物) ============
  { id: 'female/hair/bob-brown', base: 'base-female', prompt: `${KEEP}只给她加上一头深棕色齐肩直发(带整齐刘海)${STYLE}` },
  { id: 'female/hair/bun-black', base: 'base-female', prompt: `${KEEP}只给她加上黑色高丸子头发型${STYLE}` },
  { id: 'female/hair/ponytail-brown', base: 'base-female', prompt: `${KEEP}只给她加上棕色高马尾发型${STYLE}` },
  { id: 'female/hair/long-straight', base: 'base-female', prompt: `${KEEP}只给她加上一头黑色顺直长发(过肩,无刘海中分)${STYLE}` },
  { id: 'female/hair/short-bob', base: 'base-female', prompt: `${KEEP}只给她加上一头黑色齐耳波波头短发${STYLE}` },
  { id: 'female/hair/curly-long', base: 'base-female', prompt: `${KEEP}只给她加上一头棕色大波浪长卷发${STYLE}` },
  { id: 'female/hair/double-bun', base: 'base-female', prompt: `${KEEP}只给她加上黑色双丸子头发型(头顶两个对称小发髻)${STYLE}` },
  { id: 'female/hair/low-ponytail', base: 'base-female', prompt: `${KEEP}只给她加上黑色低马尾发型(马尾垂在一侧肩前)${STYLE}` },
  { id: 'female/hair/pixie', base: 'base-female', prompt: `${KEEP}只给她加上一头黑色干练超短发(精灵短发)${STYLE}` },
  { id: 'female/hair/shoulder-curl', base: 'base-female', prompt: `${KEEP}只给她加上一头黑色齐肩内扣卷发${STYLE}` },
  { id: 'female/hair/braid', base: 'base-female', prompt: `${KEEP}只给她加上垂在单侧肩前的棕色麻花辫发型${STYLE}` },
  { id: 'female/hair/gray-bun', base: 'base-female', prompt: `${KEEP}只给她加上灰白色的低发髻发型(年长者发色)${STYLE}` },
  // ============ 女 · 民族头饰+发型一体(加物;帽子/头饰/头发不好分,按用户定案整合成一件) ============
  { id: 'female/hair/kazakh-hat', base: 'base-female', prompt: `${KEEP}只给她加上哈萨克族姑娘的发型和头饰:两条黑色长辫垂在肩前,头戴红色绣金纹的塔克亚小圆帽、帽顶一撮白色羽毛(不遮挡眉毛眼睛,脸部完全不变)${STYLE}` },
  { id: 'female/hair/miao-silver', base: 'base-female', prompt: `${KEEP}只给她加上苗族姑娘的黑色盘发和华丽的苗族银冠头饰(银角冠、银泡、银蝴蝶、短银铃铛流苏,头饰不遮挡眉毛眼睛)${STYLE}` },
  { id: 'female/hair/uyghur-cap', base: 'base-female', prompt: `${KEEP}只给她加上维吾尔族姑娘的发型和头饰:两条黑色长麻花辫垂在肩前,头戴一顶彩色绣花小花帽(朵帕,不遮挡眉毛眼睛)${STYLE}` },
  // ============ 女 · 眼镜(加物) ============
  { id: 'female/glasses/round-black', base: 'base-female', eyeMode: 'clear', prompt: `${KEEP}只给她戴上一副黑色圆框眼镜${STYLE}` },
  { id: 'female/glasses/square-red', base: 'base-female', eyeMode: 'clear', prompt: `${KEEP}只给她戴上一副酒红色细方框眼镜${STYLE}` },
  { id: 'female/glasses/sunglasses', base: 'base-female', eyeMode: 'cover', prompt: `${KEEP}只给她戴上一副黑色墨镜(深色镜片太阳镜)${STYLE}` },
  // ============ 女 · 饰品(加物) ============
  { id: 'female/accessory/earrings-gold', base: 'base-female', prompt: `${KEEP}只给她戴上一对金色小圆环耳环${STYLE}` },
  { id: 'female/accessory/earrings-pearl', base: 'base-female', prompt: `${KEEP}只给她戴上一对白色珍珠耳钉${STYLE}` },
  { id: 'female/accessory/red-scarf', base: 'base-female', prompt: `${KEEP}只给她的脖子上系一条红色丝巾${STYLE}` },
  // ============ 女 · 衣服(替换) ============
  { id: 'female/clothes/white-shirt', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成白色衬衫${STYLE}` },
  { id: 'female/clothes/suit', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成深色西装套装(内搭白衬衫)${STYLE}` },
  { id: 'female/clothes/red-blouse', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成红色衬衫${STYLE}` },
  { id: 'female/clothes/workwear', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成藏蓝色工装外套${STYLE}` },
  { id: 'female/clothes/sweater', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成米色高领毛衣${STYLE}` },
  { id: 'female/clothes/tshirt-blue', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成浅蓝色圆领T恤${STYLE}` },
  // ============ 女 · 民族服饰(换装;元素取自用户的苗绣提示词:银项圈/银铃铛流苏/花卉绣纹) ============
  { id: 'female/clothes/kazakh-dress', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成哈萨克族姑娘的服装(红色连衣裙上装外套绣金花纹的坎肩,领口精致绣边)${STYLE}` },
  { id: 'female/clothes/miao-dress', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成粉紫配色的苗绣少女短褂,领口佩细银项圈和短银铃铛流苏,衣身绣满花卉纹样${STYLE}` },
  { id: 'female/clothes/mongol-robe', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成蒙古族立领长袍上衣(宝蓝色缎面、金色镶边盘扣、彩色腰带)${STYLE}` },
  { id: 'female/clothes/tibetan-robe', base: 'base-female', prompt: `${KEEP_CLOTH}只把她的上衣换成藏族氆氇藏袍上衣(绛红色、彩色条纹镶边、内搭白色衬衣)${STYLE}` },
  // ============ 女 · 五官(替换) ============
  { id: 'female/eyes/smile', base: 'base-female', prompt: `${KEEP_FACE}只把她的眼睛改成开心的眯眯笑眼(两条向下弯的弧线,闭着笑),眉毛保持原样${STYLE}` },
  { id: 'female/eyes/closed', base: 'base-female', prompt: `${KEEP_FACE}只把她的眼睛改成安静闭上的眼睛(两条平滑的闭眼弧线,带睫毛),眉毛保持原样${STYLE}` },
  { id: 'female/eyes/single-lid', base: 'base-female', prompt: `${KEEP_FACE}只把她的眼睛改成细长的单眼皮眼睛,眉毛保持原样${STYLE}` },
  { id: 'female/eyes/wink', base: 'base-female', prompt: `${KEEP_FACE}只把她的眼睛改成俏皮的单眼眨眼(一只睁开一只闭上),眉毛保持原样${STYLE}` },
  // 眼睛新维度(P2.5;大圆杏眼描述取自用户的苗绣提示词"浅棕色大圆杏眼,浓密长睫毛"):
  { id: 'female/eyes/big-round', base: 'base-female', prompt: `${KEEP_FACE}只把她的眼睛改成浅棕色的大圆杏眼(更大更圆,睁开直视前方,浓密长睫毛),眉毛保持原样${STYLE}` },
  { id: 'female/eyes/long-lash', base: 'base-female', prompt: `${KEEP_FACE}只给她的眼睛加上浓密纤长的卷翘睫毛,眼睛形状大小和瞳色完全不变,眉毛保持原样${STYLE}` },
  { id: 'female/eyes/black-pupil', base: 'base-female', prompt: `${KEEP_FACE}只把她的瞳孔虹膜颜色改成深黑色,眼睛形状大小完全不变,眉毛保持原样${STYLE}` },
  { id: 'female/eyes/amber-pupil', base: 'base-female', prompt: `${KEEP_FACE}只把她的瞳孔虹膜颜色改成浅琥珀棕色,眼睛形状大小完全不变,眉毛保持原样${STYLE}` },
  { id: 'female/mouth/laugh', base: 'base-female', prompt: `${KEEP_FACE}只把她的嘴巴改成开心大笑张开的嘴(露出上排牙齿)${STYLE}` },
  { id: 'female/mouth/o', base: 'base-female', prompt: `${KEEP_FACE}只把她的嘴唇轻轻微张成一个小小的O形惊讶嘴(幅度很小,下巴、脸部轮廓和面部其他部分完全保持不变)${STYLE}` },
  { id: 'female/mouth/grin', base: 'base-female', prompt: `${KEEP_FACE}只把她的嘴巴改成抿着嘴的浅笑${STYLE}` },
  { id: 'female/brows/thin', base: 'base-female', prompt: `${KEEP_FACE}只把她的眉毛改成纤细的柳叶眉${STYLE}` },
  { id: 'female/brows/straight', base: 'base-female', prompt: `${KEEP_FACE}只把她的眉毛改成平直的一字眉${STYLE}` },
  { id: 'female/nose/button', base: 'base-female', prompt: `${KEEP_FACE}只把她的鼻子改成小巧的圆鼻头${STYLE}` },
  { id: 'female/nose/tall', base: 'base-female', prompt: `${KEEP_FACE}只把她的鼻子改成高挺秀气的高鼻梁(鼻梁挺直立体)${STYLE}` },
  { id: 'female/nose/upturned', base: 'base-female', prompt: `${KEEP_FACE}只把她的鼻子改成小巧上翘的小翘鼻${STYLE}` },
];

const rawFile = (id) => path.join(RAW, id.replace(/\//g, '__') + '.png');

async function gen(part) {
  const baseFile = path.join(BASES, `${part.base}.jpg`);
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(baseFile).toString('base64')}`;
  const t0 = Date.now();
  const resp = await axios.post(
    `${API}/images/generations`,
    {
      model: MODEL,
      prompt: part.prompt,
      image: dataUrl,
      sequential_image_generation: 'disabled',
      response_format: 'url',
      size: '2K',
      output_format: 'png', // 无损输出:差分提取不吃 JPEG 压缩噪点
      watermark: false,
    },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, timeout: 180_000 },
  );
  const url = resp.data?.data?.[0]?.url;
  if (!url) throw new Error(`${part.id}: 无 url`);
  const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 });
  const buf = Buffer.from(img.data);
  // PNG 魔数校验:签名 URL 过期/网关错误页会以 200 回 HTML,存成坏 .png 后 skip-existing 永久跳过
  if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
    throw new Error(`${part.id}: 下载内容不是 PNG(前 4 字节 ${buf.subarray(0, 4).toString('hex')})`);
  }
  fs.writeFileSync(rawFile(part.id), buf);
  console.log(`GEN ${part.id}  ${(buf.byteLength / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const SIZE = 1024;
const TH = 60; // 差分阈值 |ΔR|+|ΔG|+|ΔB|

async function loadRaw1024(file) {
  return sharp(file).resize(SIZE, SIZE, { fit: 'cover' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** 去斑:少于 minNeighbors 个不透明邻居的像素置透明,迭代 iters 轮(近似形态学开运算,清孤立噪点) */
function despeckle(data, w, h, { minNeighbors = 3, iters = 2 } = {}) {
  for (let it = 0; it < iters; it++) {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] === 0) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const yy = y + dy, xx = x + dx;
            if (yy >= 0 && yy < h && xx >= 0 && xx < w && alpha[yy * w + xx] > 0) n++;
          }
        }
        if (n < minNeighbors) data[i * 4 + 3] = 0;
      }
    }
  }
}

/** 去绿溢色:不透明像素把 g 钳到 max(r,b)+slack(绿幕相邻像素的绿色渗染) */
function despill(data, slack = 6) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const cap = Math.max(data[i], data[i + 2]) + slack;
    if (data[i + 1] > cap) data[i + 1] = cap;
  }
}

/**
 * 绿边裁剪:贴着透明区(≤2px)且偏绿(greenness>th)的像素直接裁掉,迭代收敛。
 * 发丝与绿幕的抗锯齿过渡像素(半绿半发色)despill 压不住 —— 只能裁。
 */
function trimGreenEdge(data, w, h, { th = 14, radius = 2, iters = 3, minLum = 0 } = {}) {
  for (let it = 0; it < iters; it++) {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] === 0) continue;
        const p = i * 4;
        const greenness = data[p + 1] - Math.max(data[p], data[p + 2]);
        if (greenness <= th) continue;
        if (minLum > 0 && (data[p] + data[p + 1] + data[p + 2]) / 3 <= minLum) continue;
        let nearEdge = false;
        for (let dy = -radius; dy <= radius && !nearEdge; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w || alpha[yy * w + xx] === 0) {
              nearEdge = true;
              break;
            }
          }
        }
        if (nearEdge) {
          data[p + 3] = 0;
          changed++;
        }
      }
    }
    if (!changed) break;
  }
}

/** 绿幕色键:greenness=g-max(r,b),>hi 全透明,<lo 保留,之间羽化 */
function chromaKey(data, { hi = 90, lo = 20 } = {}) {
  for (let i = 0; i < data.length; i += 4) {
    const greenness = data[i + 1] - Math.max(data[i], data[i + 2]);
    let a = 255;
    if (greenness >= hi) a = 0;
    else if (greenness > lo) a = Math.round(255 * (1 - (greenness - lo) / (hi - lo)));
    data[i + 3] = Math.min(data[i + 3], a);
  }
}

/**
 * 连通域分析:返回每个 alpha>0 连通域的 {area, greenish, pixels}。
 * 用于 ① 清游丝/弧线(小面积或绿色占比高的孤立域)② 孔洞填充的补集判定。
 */
function components(data, w, h) {
  const label = new Int32Array(w * h); // 0=未访问
  const comps = [];
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const si = sy * w + sx;
      if (label[si] !== 0 || data[si * 4 + 3] === 0) continue;
      const id = comps.length + 1;
      let head = 0, tail = 0, area = 0, green = 0;
      const pixels = [];
      qx[tail] = sx; qy[tail] = sy; tail++;
      label[si] = id;
      while (head < tail) {
        const x = qx[head], y = qy[head]; head++;
        const i = y * w + x;
        area++;
        pixels.push(i);
        const p = i * 4;
        if (data[p + 1] - Math.max(data[p], data[p + 2]) > 10) green++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const ii = yy * w + xx;
          if (label[ii] === 0 && data[ii * 4 + 3] > 0) {
            label[ii] = id;
            qx[tail] = xx; qy[tail] = yy; tail++;
          }
        }
      }
      comps.push({ area, greenRatio: green / area, pixels });
    }
  }
  return comps;
}

/** 清游丝:面积 < minArea,或(面积 < largest*0.05 且偏绿占比高)的孤立连通域整域裁掉 */
function dropStrayComponents(data, w, h, { minArea = 900 } = {}) {
  const comps = components(data, w, h);
  const largest = Math.max(1, ...comps.map((c) => c.area));
  let dropped = 0;
  for (const c of comps) {
    const stray = c.area < minArea || (c.area < largest * 0.05 && c.greenRatio > 0.3);
    if (!stray) continue;
    for (const i of c.pixels) data[i * 4 + 3] = 0;
    dropped++;
  }
  return dropped;
}

/**
 * 孔洞填充:部件内部「变化小于差分阈值」的小透明洞(发丝过渡区)会透出基准光头皮肤 —— 回填。
 * 从画布边界 flood fill 透明区,填不到的透明像素=内部洞;只填 < maxHoleArea 的洞
 * (眼镜镜片是合法大"洞",要透出基准的眼睛,不能填)。洞内 RGB 就是变体图原像素,置回 alpha 即可。
 */
function fillHoles(data, w, h, { maxHoleArea = 3000 } = {}) {
  const outside = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (x, y) => {
    const i = y * w + x;
    if (outside[i] || data[i * 4 + 3] > 0) return;
    outside[i] = 1;
    qx[tail] = x; qy[tail] = y; tail++;
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // 内部透明洞 = 既非不透明也非 outside;按洞连通域分组,小洞回填
  const visited = new Uint8Array(w * h);
  let filled = 0;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const si = sy * w + sx;
      if (visited[si] || outside[si] || data[si * 4 + 3] > 0) continue;
      let hh = 0, tt = 0;
      const hole = [];
      qx[tt] = sx; qy[tt] = sy; tt++;
      visited[si] = 1;
      while (hh < tt) {
        const x = qx[hh], y = qy[hh]; hh++;
        const i = y * w + x;
        hole.push(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const ii = yy * w + xx;
          if (!visited[ii] && !outside[ii] && data[ii * 4 + 3] === 0) {
            visited[ii] = 1;
            qx[tt] = xx; qy[tt] = yy; tt++;
          }
        }
      }
      if (hole.length <= maxHoleArea) {
        // 绿底守卫:被部件包住的绿幕区(马尾与颈间空隙/耳环环心/卷发洞)也是"内部洞",
        // 盲回填会变成暗青实心斑(despill 把纯绿压成暗青)。洞内平均绿度高 = 绿幕,跳过不填。
        let green = 0;
        for (const i of hole) {
          const p = i * 4;
          green += Math.max(0, data[p + 1] - Math.max(data[p], data[p + 2]));
        }
        if (green / hole.length > 25) continue;
        for (const i of hole) data[i * 4 + 3] = 255;
        filled++;
      }
    }
  }
  return filled;
}

/**
 * 细亮光晕专杀:i2i 常在发型轮廓外画一圈淡色残晕(细弧),不带绿、两端连着主体 ——
 * 色键/游丝清理都拿它没办法。判定 = 「细」(腐蚀 radius 后不存活、膨胀恢复不回来)且「亮」(lum>th)。
 * 深色发丝尖端(暗)、黑镜腿(暗)不受影响;误伤上限是镜框上的小高光点,视觉可忽略。
 */
function removeThinBrightHalo(data, w, h, { radius = 2, lumTh = 140, exemptBoxes = null } = {}) {
  const n = w * h;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  // 腐蚀:radius 邻域全不透明才存活
  const eroded = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    outer: for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!alpha[i]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w || !alpha[yy * w + xx]) continue outer;
        }
      }
      eroded[i] = 1;
    }
  }
  // 膨胀恢复(radius+1):主体边缘回得来,整体细于 ~2*radius 的结构回不来
  const keep = new Uint8Array(n);
  const R = radius + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!eroded[y * w + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) keep[yy * w + xx] = 1;
        }
      }
    }
  }
  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (!alpha[i] || keep[i]) continue;
    // 豁免盒:眼睛替换件的眼窗内,"盖住基准亮眼白"的睑皮捕获新月天然又细又亮,
    // 被光晕专杀吃掉后基准白色残角复透(闭眼 blob 屡杀不死的真凶)—— 盒内不杀
    if (exemptBoxes) {
      const x = i % w, y = Math.floor(i / w);
      if (exemptBoxes.some((bx) => inBox(x, y, bx))) continue;
    }
    const p = i * 4;
    if ((data[p] + data[p + 1] + data[p + 2]) / 3 > lumTh) {
      data[p + 3] = 0;
      removed++;
    }
  }
  return removed;
}

/**
 * 替换类部件的合法变化区(y 范围,1024 画布):五官/胡子的差分只该落在脸部,
 * i2i 顺带动到的衣领阴影/锁骨高光等散斑一律裁掉(全组合叠加时会露成色斑)。
 * 加物类(发型/眼镜/衣服/饰品)不钳 —— 发梢/衣摆本来就到处都是。
 */
const Y_CLAMP = [
  // 眼上限 385(原 250):眉毛(350~390)不属于眼睛件 —— 眼 z 抬到发型上(35)后,
  // 捕到的眉区重画碎屑会浮在眉毛/刘海阴影上显"皮屑"(P2.4);睑褶(≥392)/眼睛本体不受影响
  ['/eyes/', [385, 580]],
  ['/brows/', [260, 500]],
  ['/nose/', [400, 640]],
  ['/mouth/', [480, 780]], // 下限放宽:钳制要比补丁大,让羽化自然收尾,否则下巴切出平线
  ['/beard/', [420, 820]], // 大胡子下缘 ~810;再往下是变体自己的蓝T恤领(用户换西装时会残成蓝斑)
  ['/glasses/', [320, 560]], // 镜框+镜腿的合法范围;i2i 戴镜时可能顺手改头顶发型,污染会烤进 z=40 顶层(女墨镜"发箍弧"真凶)
];

/** 按槽位的清理参数:胡子/衣服主体巨大 → 游丝阈值放大(清领口散斑);衣服孔洞上限放大(领口缝隙回填) */
const SLOT_TUNE = {
  beard: { minArea: 3000, holeCap: 3000 },
  clothes: { minArea: 2500, holeCap: 25000 },
  default: { minArea: 900, holeCap: 3000 },
};
const tuneOf = (id) => SLOT_TUNE[id.split('/')[1]] ?? SLOT_TUNE.default;

/**
 * 眼区强捕获盒(左右两只眼的外包框):
 * - 眼镜 'cover'(墨镜):盒内降低差分门槛,强捕获"缩小的旧眼→镜片/皮肤"的弱变化,
 *   否则基准大眼的眼顶从镜框上沿探出来;配合全件 morphClose 封缝。
 * - 眼睛槽(/eyes/ 替换件):同样强捕获 —— 闭眼睑肤色与基准眼白的阴影角差异弱(d≈25),
 *   常规羽化留透明洞,底下基准睁眼的白色残角透出来(P2.3 破案的"眼角杂块")。
 * - 眼镜 'clear'(透明镜片):**不再做任何眼区清除**。i2i 戴镜时把眉眼重画一遍烤进部件,
 *   类目合并后眼镜与眼睛二选一、眼镜永远只叠在基准默认眼上 —— 烤定的重画眉眼与镜框
 *   自洽成一个整体,保留反而消灭了"基准大眼从镜框边探出白边"的错位
 *   (P2.1 打洞方案的残留病灶:洞外残迹在闭眼上穿帮、洞边基准眼白漏出框外)。
 */
const EYE_BOXES = [
  { x0: 335, y0: 330, x1: 478, y1: 485 },
  { x0: 552, y0: 330, x1: 718, y1: 485 },
];
const inBox = (x, y, b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/**
 * 白边裁剪:贴透明边、接近无彩色的亮白像素裁掉(发梢的绿色抗锯齿边被 despill 压绿后
 * 剩下白灰边,挂在深色头发外缘像结霜)。饱和度门槛防误伤肤色/金发(有彩度)。
 */
function trimWhiteEdge(data, w, h, { lumTh = 195, satTh = 40, radius = 2, iters = 2 } = {}) {
  for (let it = 0; it < iters; it++) {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] === 0) continue;
        const p = i * 4;
        const r = data[p], g = data[p + 1], bl = data[p + 2];
        if ((r + g + bl) / 3 <= lumTh) continue;
        if (Math.max(r, g, bl) - Math.min(r, g, bl) >= satTh) continue;
        let nearEdge = false;
        for (let dy = -radius; dy <= radius && !nearEdge; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w || alpha[yy * w + xx] === 0) {
              nearEdge = true;
              break;
            }
          }
        }
        if (nearEdge) {
          data[p + 3] = 0;
          changed++;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * 形态学闭合(dilate r → erode r):桥接补丁内 <2r 的缝隙。嘴部替换补丁的羽化边界会穿过
 * 基准的深笑纹留一条半透缝(残线鬼影)—— 闭合用变体自己的干净皮肤像素把缝填死。
 * 新增像素的 RGB 本来就是变体原像素(out 缓冲保留全图 RGB,只动 alpha),颜色天然正确。
 */
function morphClose(data, w, h, r = 4) {
  const n = w * h;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  const dil = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!alpha[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) dil[yy * w + xx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    outer: for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dil[i]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w || !dil[yy * w + xx]) continue outer;
        }
      }
      const p = i * 4;
      if (data[p + 3] === 0) data[p + 3] = 255;
    }
  }
}

/**
 * alpha 去尘(眼睛替换件):对 alpha 通道做 r=1 盒式模糊 → 局部覆盖率低于阈值的"游离噪尘"
 * 整片清除、覆盖率极高的针孔回填,其余保留原 alpha(羽化边不动)。
 * 眼窗强捕获必然带进"眶周重画微差"的噪尘场 —— 1024 下近乎隐形,导出 256 时锯齿化成
 * 眼周"点状虚线"(P2.4);2px 以上的睫毛笔画局部覆盖率高,安全存活。
 */
function denoiseAlpha(data, w, h, { drop = 100, fill = 200 } = {}) {
  const n = w * h;
  const cov = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          s += data[(yy * w + xx) * 4 + 3];
          c++;
        }
      cov[y * w + x] = s / c;
    }
  }
  let dropped = 0, filled = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (data[p + 3] > 0 && cov[i] < drop) { data[p + 3] = 0; dropped++; }
    else if (data[p + 3] === 0 && cov[i] >= fill) { data[p + 3] = 255; filled++; }
  }
  return { dropped, filled };
}

/**
 * 内部实心化:距离外轮廓 ≥erode 像素的"内部"里,把半透明像素(alpha≥minA)拉成全不透明。
 * 换装件的领口/衬衫重画与基准T恤色差弱 → 羽化成半透糊,基准T恤从衣服"体内"透出来
 * (女西装米色胸口、卫衣领口蓝线、白衬衫肩缝蓝条的真身)。衣服是实体织物,体内不该有
 * 任何半透明;外缘 erode 圈保留羽化边不动。alpha<minA 的体内洞交给 fillHoles(已有)。
 */
function solidifyInterior(data, w, h, { minA = 30, erode = 6 } = {}) {
  const n = w * h;
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] >= minA ? 1 : 0;
  for (let it = 0; it < erode; it++) {
    const next = new Uint8Array(n);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (
          mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]
        ) next[i] = 1;
      }
    }
    mask = next;
  }
  let solidified = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] && data[i * 4 + 3] < 255) {
      data[i * 4 + 3] = 255;
      solidified++;
    }
  }
  return solidified;
}

/**
 * 轮廓补片:i2i 画发型/换装时常把头形/肩形收窄一点点 —— 那些像素在变体图里是绿幕、
 * 在基准里是头皮/T恤,差分被色键抠掉后部件上是空的,基准从部件轮廓外凸出来
 * (灰白短发/油头的"发际肤斑"、白衬衫肩线外的藏蓝条,P2.3 破案)。
 * 判定 = 变体纯绿(gv≥40) && 基准是人体(gb<18) && 部件此处透明 → 从相邻的部件
 * 不透明像素波前式借色填充(≤48px,dome 溢出实测 10~30px;够不着的远处保持透明)。
 * 只用于 hair/clothes:五官件轮廓不变;饰品件借色会把耳环金色涂到头皮上。
 */
function fillSilhouetteGap(out, vData, bData, w, h) {
  const gap = new Uint8Array(w * h); // 0=非gap/已消化 1=待填 2=本轮已填(下轮当种子)
  let remaining = 0;
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const gv = vData[p + 1] - Math.max(vData[p], vData[p + 2]);
    const gb = bData[p + 1] - Math.max(bData[p], bData[p + 2]);
    if (gv >= 40 && gb < 18 && out[p + 3] < 200) {
      gap[i] = 1;
      remaining++;
    }
  }
  if (!remaining) return 0;
  let filled = 0;
  for (let it = 0; it < 48 && remaining > 0; it++) {
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (gap[i] !== 1) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const ii = yy * w + xx;
          if (gap[ii] === 0 && out[ii * 4 + 3] > 200) {
            const p = i * 4, q = ii * 4;
            out[p] = out[q]; out[p + 1] = out[q + 1]; out[p + 2] = out[q + 2]; out[p + 3] = 255;
            gap[i] = 2;
            changed++; filled++; remaining--;
            break;
          }
        }
      }
    }
    for (let i = 0; i < w * h; i++) if (gap[i] === 2) gap[i] = 0;
    if (!changed) break;
  }
  return filled;
}

async function extract(part) {
  const vFile = rawFile(part.id);
  if (!fs.existsSync(vFile)) return console.log(`跳过 ${part.id}(缺 raw)`);
  const v = await loadRaw1024(vFile);
  const b = await loadRaw1024(path.join(BASES, `${part.base}.jpg`));
  const out = Buffer.from(v.data);
  // 羽化差分:d≤FE_LO 透明,d≥FE_HI 不透明,之间线性 —— 发际线/镜框阴影的过渡不再是硬边补丁。
  // 按槽位调:眼/眉要强捕获(旧眼睑→皮肤变化小,FE 高了补丁出洞旧眼透出=闭眼重灾区);
  // 嘴/鼻取中间档(太低会放大补丁与基准的微色差,像贴了膏药);胡子接近加物类。
  // hair/beard 也要低窗:发顶高光/胡须光泽的颜色可能恰好接近基准头皮(d≈60),
  // 落在 40~90 羽化区会变半透明缝,底下头皮透出来 = "发箍弧"/浅竖条(P2.2 破案)
  const FEATHER = {
    // 眼:睑/睫毛/眼球替换处处是强差分(d>105),弱窗只会把 i2i 整脸重打光的"弱纱"(d 20~55)
    // 收进来 —— 发件眼窗清透明后纱块透出来显"淡色矩形"(P2.4 终局破案,与大笑嘴同方)
    eyes: [55, 105],
    brows: [22, 65],
    mouth: [30, 70],
    nose: [30, 70],
    beard: [25, 70],
    hair: [20, 55],
  };
  // 单件调参:个别部件的病灶要按件下药(槽位级参数动了会牵连整槽)
  const PART_TUNE = {
    // 丝巾:i2i 顺手把丝巾下的T恤重画了(米色残底+白纽扣门襟鬼影),配深色衣服时浮出来。
    // 羽化抬高杀弱残底;keepRed=红色主导门槛(r-max(g,b)≥22 才保留),纽扣门襟是强差分
    // 只靠羽化杀不掉 —— 丝巾本体大红/暗红阴影/粉白高光全是红主导,一门全过
    'female/accessory/red-scarf': { feather: [60, 120], keepRed: 22 },
    // (曾有 curtain-brown keepEyeBox 豁免 —— 眼区清除改"孤岛连通性判据"后垂丝天然保留,已撤)
    // 苗银冠:银流苏合法垂入眼区,烤死的重画大眼经流苏连到主体、孤岛判据抓不住
    // (用户实报配眼睛变体时新旧眼叠影)→ 眼区只留"亮+冷调"的银饰(银=中性偏冷高亮;
    // 眼白/皮肤/虹膜=暖调、睫毛=暗,全出局)
    'female/hair/miao-silver': { eyeBoxSilverOnly: true },
    // 男花帽:i2i 两版都顺手重画脸;帽子只住头顶 → 钳制区硬裁一切脸部私货
    'male/hair/uyghur-cap': { clampY: [40, 380] },
    // 男蒙古袍:i2i 会顺手重画头部(脸颊补丁/耳周白晕,分层实锤在袍件不在帽件)→ 钳制兜底
    'male/clothes/mongol-robe': { clampY: [555, 1023] },
    // 大笑:下颌重画鬼影(旧笑纹/颌线的弱差分半透糊在下巴和脖子上,a≈197 双重曝光);
    // 张口/牙齿/下唇本体是强差分(d>110)不受影响。clampY 收窄把脖子上的鬼影直接裁掉
    'male/mouth/laugh': { feather: [55, 105], clampY: [480, 710] },
    'female/mouth/laugh': { feather: [55, 105], clampY: [480, 710] },
    // 女西装:内搭白衬衫与基准米色T恤色差弱(d≈67),默认羽化[40,90]把整块胸口捕成
    // 半透糊+筛洞(单件看似米白衬衫,旁边一压红丝巾就露馅)→ 强捕获;配合衣服内部实心化
    'female/clothes/suit': { feather: [18, 55] },
    // 灰白短发/油头:发际顶部 i2i 画了"绿幕混发丝"糊边(绿度仅~15 色键够不到,亮度>135),
    // 提取成灰泥色斑。mushTrim = 把「亮+偏绿+贴透明」的迭代裁剪轮数放大,逐层吃穿多孔糊斑;
    // 深发丝(暗)与纯灰白发(不偏绿)都进不了判定,无回归面
    'male/hair/gray-short': { mushTrim: 24 },
    'male/hair/slicked': { mushTrim: 24 },
  };
  const ptune = PART_TUNE[part.id];
  const [FE_LO, FE_HI] = ptune?.feather ?? FEATHER[part.id.split('/')[1]] ?? [40, 90];
  const clamp = ptune?.clampY ?? Y_CLAMP.find(([pre]) => part.id.includes(pre))?.[1];
  const W = v.info.width;
  for (let i = 0; i < v.data.length; i += 4) {
    const d =
      Math.abs(v.data[i] - b.data[i]) +
      Math.abs(v.data[i + 1] - b.data[i + 1]) +
      Math.abs(v.data[i + 2] - b.data[i + 2]);
    const px = (i / 4) % W;
    const py = Math.floor(i / 4 / W);
    let lo = FE_LO, hi = FE_HI;
    // 眼窗强捕获只给墨镜(cover):防基准大眼眼顶从镜框上沿探出(下限不能低于 ~12:
    // raw(png)与基准(jpg)之间有渲染/压缩噪声底 d 4~18)。
    // ⚠ 眼睛替换件不做眼窗强捕获/实心化(P2.4 反复实测回退):强捕获会把 i2i 整脸重打光
    // 的弱纱(d 12~40)收进来,实心化再钉成不透明 → 眼区"淡色盒块";当年立此机制针对的
    // "闭眼白色残角"实为 raw 烤的杂块(已重生成根治),眼睛件用槽位羽化 [22,65] 本就干净。
    // 透明镜('clear')不做任何处理:烤定的重画眉眼整套保留,与镜框自洽(合并后眼镜只叠基准眼)
    if (part.eyeMode === 'cover' && EYE_BOXES.some((bx) => inBox(px, py, bx))) {
      lo = 12; hi = 40;
    } else if (
      part.id.includes('/hair/') &&
      (py >= 620 || (py >= 290 && px >= 250 && px <= 790)) &&
      !(ptune?.chestFeather === false)
    ) {
      // 发件面部区(y 290~620, x 250~790)+颈胸肩区(y≥620 全宽):
      // i2i 画发型时会把整脸"重打光"一层弱纱(d 20~105)+重画发丝周围的T恤/颈影 ——
      // 基准上隐形,配眼睛变体/深色衣服就显形(眼周虚线点、米色肩章、眉区淡带,
      // P2.4 全系病灶的总根)。事后清除必留缝(挖洞=矩形缝/回填=咬痕/洪泛=条带)。
      // ⚠ 一刀抬羽化到 [105,150] 会连细碎飞发一起杀(半透明覆盖的发丝整根 d 45~105,
      //   用户实报"发丝抠不出来")—— 改**暗化方向门**:发丝盖在亮底(皮肤/米T)上必然
      //   把像素压暗(哪怕 20% 覆盖),重打光纱/重画残迹是"同亮或更亮"。
      //   亮底(基准 lum>140):保留常规羽化,但只放行"明显变暗"的像素;
      //   暗底(男款藏青T恤等,发比底亮,方向门失效):维持高抬羽化(残迹深对深本就隐形)。
      //   副产品:弱纱死透后,眼妆私货失去"皮肤桥"变成孤岛 → 下方眼区清除得以用
      //   连通性判据取代盲清(刘海/头饰垂饰不再被切方口)
      const bl = (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3;
      if (bl > 140) {
        const vl = (v.data[i] + v.data[i + 1] + v.data[i + 2]) / 3;
        if (vl > bl - 28) {
          out[i + 3] = 0;
          continue;
        }
        // 变暗像素 = 发丝/发影,常规羽化放行(飞发半透覆盖 d 45~105 也能进来)
      } else {
        lo = 105; hi = 150;
      }
    }
    const a = d <= lo ? 0 : d >= hi ? 255 : Math.round(((d - lo) / (hi - lo)) * 255);
    out[i + 3] = Math.min(out[i + 3], a);
    if (clamp) {
      if (py < clamp[0] || py > clamp[1]) out[i + 3] = 0;
      else if (py > clamp[1] - 25) {
        // 钳制下缘渐隐:硬切会留一条水平切线(胡子下摆压在衣领上的细金线)
        out[i + 3] = Math.round(out[i + 3] * ((clamp[1] - py) / 25));
      } else if (py < clamp[0] + 12) {
        // 上缘同理渐入(眼睛件上限收到 385 后,硬切在睑褶处留水平缝)
        out[i + 3] = Math.round(out[i + 3] * ((py - clamp[0]) / 12));
      }
    }
  }
  // 红色主导门(丝巾等单色饰品):非红主导像素一律裁掉(见 PART_TUNE 注释)
  if (ptune?.keepRed) {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      if (out[i] - Math.max(out[i + 1], out[i + 2]) < ptune.keepRed) out[i + 3] = 0;
    }
  }
  // 后处理链:色键清绿残块(lo 下探到浅绿,清 i2i 头顶光晕) → 清游丝 → 孔洞回填(露头皮)
  //          → 绿边裁剪(暗绿) → 亮绿光晕专项裁剪 → 去溢色
  // 边缘感知色键:纯绿(≥hi)整图杀;中度偏绿(lo..hi)只杀"贴近透明边 ≤3px"的 ——
  // 绿幕会在黑发高光/发缝上反绿光,内部反绿一刀切会抠出透明缝,底下基准头皮透出成奶油色弧/竖条
  // (低马尾"发箍弧"、卷发浅竖条的真身);内部偏绿留给 despill 中和成中性高光。
  {
    const W2 = v.info.width, H2 = v.info.height;
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] > 0 && out[i + 1] - Math.max(out[i], out[i + 2]) >= 90) out[i + 3] = 0;
    }
    const alpha = new Uint8Array(W2 * H2);
    for (let i = 0; i < W2 * H2; i++) alpha[i] = out[i * 4 + 3];
    const R = 3;
    for (let y = 0; y < H2; y++) {
      for (let x = 0; x < W2; x++) {
        const i = y * W2 + x;
        if (alpha[i] === 0) continue;
        const p = i * 4;
        const greenness = out[p + 1] - Math.max(out[p], out[p + 2]);
        if (greenness < 35) continue;
        let nearEdge = false;
        for (let dy = -R; dy <= R && !nearEdge; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= H2 || xx < 0 || xx >= W2 || alpha[yy * W2 + xx] === 0) {
              nearEdge = true;
              break;
            }
          }
        }
        if (nearEdge) out[p + 3] = 0;
      }
    }
  }
  despeckle(out, v.info.width, v.info.height);
  const tune = tuneOf(part.id);
  const strays = dropStrayComponents(out, v.info.width, v.info.height, { minArea: tune.minArea });
  // 替换补丁先闭合缝隙(残线鬼影 = 羽化边界穿过基准笑纹/睫毛留下的半透缝,双重曝光),再回填大洞;
  // 墨镜(cover)同闭合 —— 把"盖旧眼顶"的弱捕获区与镜片桥接成整块
  if (/\/(mouth|nose|eyes|brows)\//.test(part.id) || part.eyeMode === 'cover') {
    morphClose(out, v.info.width, v.info.height, 5);
  }
  // 眼睛替换件:只做 alpha 去尘(游离噪尘/针孔)。
  // ⚠ 曾走过"眼窗强捕获+实心化""眼窗整盒 verbatim(+渐变坡/色偏校正)"两条路,P2.4 反复
  // 实测全部回退:i2i 整脸重打光的弱纱(d 12~40)会被强捕获收进来、被实心化钉成不透明,
  // 在浅色背景 256 缩图上显出"淡色盒块";当年立机制针对的"闭眼白色残角"实为 raw 烤的
  // 杂块(已重生成根治)。用户所见"眼周虚线点"的真凶是发件带的眼妆私货(见发型眼区清除)
  if (part.id.includes('/eyes/')) {
    denoiseAlpha(out, v.info.width, v.info.height);
  }
  // 衣服内部实心化:治"半透糊透基准T恤"(女西装米色胸口/卫衣领口蓝线/白衬衫肩缝蓝条)
  if (part.id.includes('/clothes/')) {
    solidifyInterior(out, v.info.width, v.info.height);
  }
  const holes = fillHoles(out, v.info.width, v.info.height, { maxHoleArea: tune.holeCap });
  // keepRed 第二刀:第一刀在色键前杀非红,留下的内部洞刚被 fillHoles 按"原像素"回填回来
  // (回填 RGB 就是被杀的灰底)—— 洞填完再过一遍红门,灰底真正出局(透出底下衣服,像巾尾间隙)。
  // 半透明像素门槛更严(<240 要 rd≥60):洞边的红灰羽化残渣叠在深色衣服上是一圈脏毛边
  if (ptune?.keepRed) {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      const rd = out[i] - Math.max(out[i + 1], out[i + 2]);
      if (rd < ptune.keepRed || (out[i + 3] < 240 && rd < 60)) out[i + 3] = 0;
    }
    // 洞边收边:贴透明、红度不足的暗棕残渣逐圈咬掉(丝巾暗红阴影 rd≈75 安全;
    // 被杀灰底的过渡毛边 rd 40~60 出局),毛边内缩到纯红区为止
    for (let it = 0; it < 3; it++) {
      const W4 = v.info.width, H4 = v.info.height;
      const alpha = new Uint8Array(W4 * H4);
      for (let i = 0; i < W4 * H4; i++) alpha[i] = out[i * 4 + 3];
      for (let y = 0; y < H4; y++) {
        for (let x = 0; x < W4; x++) {
          const i = y * W4 + x;
          if (alpha[i] === 0) continue;
          const p = i * 4;
          if (out[p] - Math.max(out[p + 1], out[p + 2]) >= 60) continue;
          let nearEdge = false;
          for (let dy = -2; dy <= 2 && !nearEdge; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= H4 || xx < 0 || xx >= W4 || alpha[yy * W4 + xx] === 0) { nearEdge = true; break; }
            }
          if (nearEdge) out[p + 3] = 0;
        }
      }
    }
  }
  trimGreenEdge(out, v.info.width, v.info.height);
  trimGreenEdge(out, v.info.width, v.info.height, { th: 6, radius: 3, iters: 4, minLum: 135 });
  const halo = removeThinBrightHalo(out, v.info.width, v.info.height, {
    exemptBoxes: part.id.includes('/eyes/') ? EYE_BOXES : null,
  });
  // 发型专项:光晕阈值下探(低马尾头顶"发箍弧"亮度低于 140)+ 白边裁剪(绿边被 despill
  // 压成白灰边挂在发梢);金耳环等亮细饰品在 accessory 槽不受影响
  if (part.id.includes('/hair/')) {
    // 面部禁区:i2i 加发型时常顺手把眉眼/唇整套重画(低马尾实测眼区烤了 2 万像素的
    // "带虹膜新眼睛",经皮肤桥连进主发体 —— 连通性判不住),发型 z=30 在五官替换件之上
    // → 用户换闭眼/单眼皮时碎睫毛/眼白圈浮在上面(P2.4 眼周"虚线点"真凶,与眼镜件
    // 带私货同案不同层)。两刀:
    // ① 眼盒下半区(y≥405,刘海到不了、眼球/睫毛所在)无差别清除 —— 例外:中分刘海
    //    (curtain)的真发丝垂到盒底,PART_TUNE.keepEyeBox 豁免(其残片贴着发丝,似"发后露眼白"可容)
    {
      // ⚠ 挖洞式清理在这里行不通:发件的眼区重画整体带色调漂移(如刘海阴影),按盒挖掉
      //   后底下基准更亮的皮肤沿盒框露出来 = "淡色矩形贴片"(P2.4 跨 4 个方案追凶的教训)。
      // 无缝方案 = 基准回填:盒内该清的像素不置透明,改写成基准原像素(alpha 255)——
      //   与底层基准逐像素相同,零接缝;眼睛槽 z 已抬到发型之上,眼睛变体盖得住这层回填。
      // 该清的 = ① 亮像素(lum≥150,重画的皮肤/眼白;深色真发丝 60~130 保住)
      //          ② 细碎深色结构(睫毛/眼线笔画):盒内深色掩膜经 腐蚀r3→种子→沿掩膜重建,
      //             重建不到的 = 又细又孤立(粗大刘海/贴边垂发经盒界种子必然存活,中分刘海无需豁免)
      // 眼区私货清除(连通性判据):重画的虹膜/浓睫毛是强差分,面部区暗化门挡不住 ——
      // 但暗化门已把"整脸重打光弱纱"(它们借以连通主发体的皮肤桥)杀干净,
      // 剩下的眼妆私货成了孤立岛 → **完整落在眼盒内的连通域 = 私货**,整域清除。
      // 刘海尖/苗银冠垂饰/中分垂丝都从盒界外伸进来 → 天然保留(不再需要 keepEyeBox 豁免,
      // 也根治了旧"眼芯盲清"把刘海/头饰切出方形缺口的问题 —— 用户实报"被眼睛的边框挡住")
      // 银饰门(见 PART_TUNE.eyeBoxSilverOnly):先于孤岛判据,把眼盒内非银内容全清 ——
      // 清完后残余暖色碎屑若成孤岛,下方判据顺手收尾
      if (ptune?.eyeBoxSilverOnly) {
        // 只动 y≥400(眼睛高度,烤眼私货所在):流苏帘住 330~400 完全不动。
        // lum≥75:阴影里的银流苏尖(~90~120)保住;黑睫毛(~40)/虹膜暗部/暖调肤与眼白出局
        const W5s = v.info.width;
        for (let i = 0; i < out.length; i += 4) {
          if (out[i + 3] === 0) continue;
          const x5 = (i / 4) % W5s, y5 = Math.floor(i / 4 / W5s);
          if (y5 < 400 || !EYE_BOXES.some((bx) => inBox(x5, y5, bx))) continue;
          const lum = (out[i] + out[i + 1] + out[i + 2]) / 3;
          const cool = out[i + 2] >= out[i] - 4; // b≥r-4:银的中性偏冷;肤/眼白/虹膜 r 明显大
          if (!(lum >= 75 && cool)) out[i + 3] = 0;
        }
      }
      // (银饰门件跳过孤岛清:被门切断的银流苏尖是孤岛但要保;烤眼私货已由门清掉)
      if (!ptune?.eyeBoxSilverOnly) {
        const W5b = v.info.width, H5b = v.info.height;
        const comps = components(out, W5b, H5b);
        let cleared = 0;
        for (const c of comps) {
          let bx0 = W5b, by0 = H5b, bx1 = 0, by1 = 0;
          for (const i of c.pixels) {
            const x = i % W5b, y = Math.floor(i / W5b);
            if (x < bx0) bx0 = x;
            if (x > bx1) bx1 = x;
            if (y < by0) by0 = y;
            if (y > by1) by1 = y;
          }
          if (EYE_BOXES.some((b2) => bx0 >= b2.x0 && bx1 <= b2.x1 && by0 >= b2.y0 && by1 <= b2.y1)) {
            for (const i of c.pixels) out[i * 4 + 3] = 0;
            cleared += c.area;
          }
        }
        if (cleared) console.log(`  · ${part.id}: 眼区孤岛私货清除 ${cleared}px`);
      }
    }
    // ② 完整落在禁区盒(两眼盒+中脸鼻唇盒)内的连通域整域清除(眉线断栅/唇部重画等
    //    游离残片;刘海/垂发连着主发体,"完整在盒内"判定天然保护)
    {
      const SHIELD = [
        ...EYE_BOXES,
        { x0: 395, y0: 485, x1: 645, y1: 735 }, // 鼻+唇中脸区
      ];
      const W5 = v.info.width, H5 = v.info.height;
      const comps = components(out, W5, H5);
      let shielded = 0;
      for (const c of comps) {
        let bx0 = W5, by0 = H5, bx1 = 0, by1 = 0;
        for (const i of c.pixels) {
          const x = i % W5, y = Math.floor(i / W5);
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
        if (SHIELD.some((b) => bx0 >= b.x0 && bx1 <= b.x1 && by0 >= b.y0 && by1 <= b.y1)) {
          for (const i of c.pixels) out[i * 4 + 3] = 0;
          shielded += c.area;
        }
      }
      if (shielded) console.log(`  · ${part.id}: 面部禁区清除 ${shielded}px`);
    }
    // r3:低马尾的"发箍弧"有 6~8px 粗,r2 腐蚀存活杀不掉;深色发丝尖(lum<120)有亮度门保护
    removeThinBrightHalo(out, v.info.width, v.info.height, { lumTh: 120, radius: 3 });
    trimWhiteEdge(out, v.info.width, v.info.height);
    // 发际糊斑专杀(见 PART_TUNE.mushTrim):加大迭代轮数逐层吃穿"亮+偏绿+多孔"的糊边斑
    if (ptune?.mushTrim) {
      trimGreenEdge(out, v.info.width, v.info.height, {
        th: 6, radius: 3, iters: ptune.mushTrim, minLum: 135,
      });
    }
  }
  if (part.id.includes('/glasses/')) {
    // 眼镜件的"亮细残迹":i2i 戴镜时顺手改了发丝/发际,浅色细条烤进 z=40 顶层浮在头发上;
    // 镜框玻璃反光块/银铰链足够粗(腐蚀 r2 存活)不受影响
    removeThinBrightHalo(out, v.info.width, v.info.height, { lumTh: 150, radius: 2 });
  }
  // 眼区处理(eyeMode)会切断"经桥挂在主体上"的残块 → 补扫连通域。
  // ⚠ 眼镜的框线在眼窗内会被切成小段,补扫阈值单独调小(框段>250,眉眼残线<250)
  dropStrayComponents(out, v.info.width, v.info.height, {
    minArea: part.eyeMode ? 250 : tune.minArea,
  });
  despeckle(out, v.info.width, v.info.height); // 收尾清孤点
  // 轮廓补片(发型/衣服):盖住"变体把头/身画小"后从轮廓外凸出的基准头皮/T恤
  if (/\/(hair|clothes)\//.test(part.id)) {
    const gaps = fillSilhouetteGap(out, v.data, b.data, v.info.width, v.info.height);
    if (gaps) console.log(`  · ${part.id}: 轮廓补 ${gaps}px`);
  }
  despill(out);
  if (strays || holes || halo)
    console.log(`  · ${part.id}: 游丝 ${strays} 域 / 回填洞 ${holes} / 光晕 ${halo}px`);
  const file = path.join(OUT, part.id.replace(/\//g, '__') + '.webp');
  await sharp(out, { raw: { width: v.info.width, height: v.info.height, channels: 4 } })
    .webp({ quality: 90 })
    .toFile(file);
  console.log(`EXT ${part.id}  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

/** 基准图:绿幕抠掉 → 透明底(编辑器成品透明背景/自选背景色的前提) */
async function exportBases() {
  for (const b of ['base-male', 'base-female']) {
    const { data, info } = await loadRaw1024(path.join(BASES, `${b}.jpg`));
    const out = Buffer.from(data);
    chromaKey(out);
    despeckle(out, info.width, info.height);
    trimGreenEdge(out, info.width, info.height);
    // 基准专项:默认 trimGreenEdge 只裁 3 圈,而 2K→1024 缩放后的绿 AA 边有 5~8px 宽
    // (外圈渐变 alpha,每轮只有最外 1px 贴到全透明)→ 残边被 despill 压成"黄绿毛边",
    // 浅色背景导出时贴着头形显形;发梢与它交错还拼出"竖纹乱码块"(P2.4 破案)。
    // 加深迭代逐圈吃穿;贴边判定保住体内的绿溢光(交给 despill 中和)
    trimGreenEdge(out, info.width, info.height, { th: 10, radius: 3, iters: 12 });
    despeckle(out, info.width, info.height);
    despill(out);
    const file = path.join(OUT, `${b}.webp`);
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ quality: 90 })
      .toFile(file);
    console.log(`BASE ${b}(透明底)  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
  }
}

async function pool(jobs, limit) {
  const q = [...jobs];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (q.length) {
        const j = q.shift();
        try {
          await j();
        } catch (e) {
          console.error('FAIL:', e?.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : String(e?.message ?? e));
        }
      }
    }),
  );
}

// 用法: node gen-parts.mjs [gen|extract|all] [前缀过滤,逗号分隔]
//   如: node gen-parts.mjs gen male/eyes,male/mouth   只生成试产批
const mode = process.argv[2] ?? 'all';
const prefixes = (process.argv[3] ?? '').split(',').filter(Boolean);
const inScope = (p) => prefixes.length === 0 || prefixes.some((pre) => p.id.startsWith(pre));

if (mode === 'gen' || mode === 'all') {
  if (!KEY) { console.error('缺 ARK_KEY'); process.exit(1); }
  const jobs = PARTS.filter((p) => inScope(p) && !fs.existsSync(rawFile(p.id)));
  console.log(`待生成 ${jobs.length} 个`);
  await pool(jobs.map((p) => () => gen(p)), 2);
}
const extractFails = [];
if (mode === 'extract' || mode === 'all') {
  await exportBases();
  for (const p of PARTS) {
    if (!inScope(p)) continue;
    try {
      await extract(p);
    } catch (e) {
      // 单件失败(raw 损坏等)不卡死整条流水线;坏 raw 删掉让下一轮 gen 重新生成
      extractFails.push(p.id);
      console.error(`EXTRACT FAIL ${p.id}: ${String(e?.message ?? e).slice(0, 200)}`);
      try {
        fs.unlinkSync(rawFile(p.id));
        console.error(`  已删除疑似损坏的 raw,下轮 gen 会重新生成`);
      } catch {
        /* raw 不存在等,忽略 */
      }
    }
  }
}
if (extractFails.length) {
  console.error(`\n提取失败 ${extractFails.length} 件: ${extractFails.join(', ')}`);
  process.exitCode = 1;
}
console.log('done');
