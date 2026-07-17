/**
 * 多行粘贴解析 —— 用于证书发证 Step 3 个人录入。
 *
 * 把用户粘贴的多行文本(每行一个被表彰人)拆成 { name, empNo } 数组,
 * 之后前端再调 `usersApi.lookupByEmpNo` 一次性查回部门并回填。
 *
 * 健壮性(2026-05 优化):
 *  - 全角转半角:全角数字、全角逗号、全角空格 等先归一化,避免「全角失效」。
 *  - 分隔符广覆盖:空白 / Tab / 中英文逗号 / 顿号 / 分号 / 点 / 连字符 - /
 *    下划线 _ / 竖线 | / 中点 等都当分隔。
 *  - 姓名与员工号粘连也能拆:「张三10001」自动在数字串前断开。
 *  - empNo 启发式:行内任何「3 位以上纯数字」段视为员工号;其余首个非数字段视为姓名。
 *  - 多余字段(职务、备注等)忽略。
 *
 * 例(以下都解析成 { name:"张三", empNo:"10001" }):
 *   "张三  10001" / "张三,10001" / "张三、10001" / "张三-10001" /
 *   "张三.10001" / "张三10001"(粘连) / 全角数字写法
 * 其它:
 *   "李四,20003,综合处" → { name:"李四", empNo:"20003" }(备注忽略)
 *   "10005 王五"        → { name:"王五", empNo:"10005" }(顺序无所谓)
 *   "王五"               → { name:"王五", empNo:"" }(没员工号)
 *   ""                    → 忽略(空行不返回)
 *
 * ★ 2026-07-17 新增「单位:姓名1、姓名2」模式(表彰文件的标准排版):
 *   "云贵分公司:聂  伟、朱智勇"
 *     → [{ name:"聂伟", empNo:"", orgName:"云贵分公司" },
 *        { name:"朱智勇", empNo:"", orgName:"云贵分公司" }]
 *   orgName 用于重名时确定「是哪一位」(库里 3638 人重名)。
 *
 *   **该模式由「行内有冒号」严格门控**,老格式一行一人的解析路径逐字节不变 ——
 *   因为 `,` 在老契约里是「姓名/工号分隔」("李四,20003,综合处"),在新格式里
 *   却是「人级分隔」;无条件改分隔语义会把老格式炸成 3 个人,其中「综合处」
 *   还是个能通过非空校验的**假人**。
 */
export interface PersonLineParsed {
  name: string;
  empNo: string;
  /** 「单位:姓名…」里冒号左边的单位原文(只在该模式下有值);只参与匹配,不是权威归属 */
  orgName?: string;
}

/**
 * 全角 → 半角:全角 ASCII 区 U+FF01–U+FF5E 平移到半角;全角空格 U+3000 → 普通空格。
 * 用字符码逐字处理,源码里不出现全角字形(规避 eslint no-irregular-whitespace)。
 */
function toHalfWidth(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code === 0x3000) {
      out += " "; // 全角空格 → 普通空格
    } else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0); // 全角 ASCII → 半角
    } else {
      out += ch;
    }
  }
  return out;
}

// 分隔符(半角 + 中文标点,全角已在 toHalfWidth 归一):
// 空白 \s / 逗号 , / 分号 ; / 顿号 、 / 句号 。 / 中点 · ・ /
// 点 . / 连字符 - / 下划线 _ / 斜杠 / / 竖线 |
const SEP_RE = /[\s,;、。·・.\-_/|]+/g;
const EMP_NO_RE = /^\d{3,}$/;
// 3 位以上数字串,用于把「姓名+工号」粘连的 token 在数字前后断开
const DIGIT_RUN_RE = /(\d{3,})/g;

/**
 * 人级分隔符 —— 只在「单位:姓名…」模式下用。
 * **刻意不含空格**(空格在老契约里是「姓名/工号」分隔,当人级分隔会把「聂  伟」拆成两人);
 * **刻意不含中点 ·**(「买买提·艾力」是一个人,当分隔符会凭空多发一张证书)。
 */
const PERSON_SEP_RE = /[、;,]+/;

/** 冒号左边不可能是单位的词 —— 命中即回退老逻辑 */
const NOT_ORG_PREFIX = ["备注", "说明", "名单", "其中", "共计", "附件", "合计", "注"];

/**
 * 「单位:姓名…」模式下解析单个人名块。
 *
 * 与老逻辑的关键差异:**先摘工号,剩下的整块去空白当姓名**,而不是按分隔符切词取第一个 ——
 * 这样才能同时正确处理:
 *   "聂  伟"        → 聂伟    (公文给 2 字姓名垫空格对齐)
 *   "买买提·艾力"   → 买买提·艾力 (间隔号是姓名的一部分,不拆)
 *   "张三10001"     → 张三 + 10001
 */
function parseChunkPerson(chunk: string): PersonLineParsed | null {
  const m = chunk.match(/\d{3,}/);
  const empNo = m ? m[0] : "";
  // 按**下标**剜掉工号,不用 replace(m[0],'') —— 后者删的是该子串的首次出现位置,
  // 未必是匹配到的那一处(如「12张三123」会删错地方)
  const name = (m ? chunk.slice(0, m.index) + chunk.slice(m.index! + m[0].length) : chunk)
    .replace(/\s+/g, "")
    .replace(/^[,;、。.\-_/|]+|[,;、。.\-_/|]+$/g, "");
  if (!name) return null; // 纯数字块 → 丢弃(不做「回挂到前一个人」的隐式推断)
  // 姓名至少要有一个汉字/字母 —— 挡住「会议时间:10:30」这类把时间当人名的误判
  // (name 上面已去空白,这里不必再处理空白)
  if (!/[一-鿿㐀-䶿a-zA-Z]/.test(name)) return null;
  // 姓名里不该还剩冒号(说明这行不是「单位:名单」结构)
  if (name.includes(":")) return null;
  return { name, empNo, orgName: undefined };
}

/**
 * 判断并解析「单位:姓名1、姓名2」。不符合该模式返回 null(调用方回退老逻辑)。
 * 守卫从严 —— 宁可回退到老逻辑,也不要把「10:30」「备注:xxx」误当成单位名单。
 */
function tryOrgPrefixLine(line: string): PersonLineParsed[] | null {
  const ci = line.indexOf(":"); // 全角冒号已被 toHalfWidth 归一
  if (ci <= 0) return null;
  const left = line.slice(0, ci).trim();
  const right = line.slice(ci + 1).trim();
  if (!right) return null;
  if (left.length < 2 || left.length > 20) return null;
  if (/\d{3,}/.test(left)) return null; // 排除 "10:30" 这类
  if (NOT_ORG_PREFIX.some((w) => left.startsWith(w))) return null;

  const people = right
    .split(PERSON_SEP_RE)
    .map((c) => c.trim())
    .filter(Boolean)
    .map(parseChunkPerson)
    .filter((p): p is PersonLineParsed => p !== null);
  if (people.length === 0) return null;
  return people.map((p) => ({ ...p, orgName: left }));
}

export function parsePersonLines(text: string): PersonLineParsed[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => toHalfWidth(line).trim())
    .filter(Boolean)
    .flatMap((line) => {
      // 新增:「单位:姓名1、姓名2」模式(严格门控,不命中则走下面的老逻辑)
      const byOrg = tryOrgPrefixLine(line);
      if (byOrg) return byOrg;

      // ─── 以下为老逻辑,逐字节未改 ───
      // 1) 分隔符 → 空格;2) 在数字串前后补空格,拆开粘连;3) 收敛空白后切词
      const tokens = line
        .replace(SEP_RE, " ")
        .replace(DIGIT_RUN_RE, " $1 ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean);
      const empNo = tokens.find((t) => EMP_NO_RE.test(t)) ?? "";
      const name = tokens.find((t) => t !== empNo && !/^\d+$/.test(t)) ?? "";
      return [{ name, empNo }];
    });
}
