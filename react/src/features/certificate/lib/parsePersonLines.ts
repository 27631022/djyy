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
 */
export interface PersonLineParsed {
  name: string;
  empNo: string;
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

export function parsePersonLines(text: string): PersonLineParsed[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => toHalfWidth(line).trim())
    .filter(Boolean)
    .map((line) => {
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
      return { name, empNo };
    });
}
