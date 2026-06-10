/**
 * 名单多行粘贴解析(确定性兜底,不依赖 AI)。
 *
 * 思路 fork 自 certificate/lib/parsePersonLines.ts,但名单字段更多:
 *   姓名 / 单位 / 职务 / 评分。列顺序按「姓名 → 单位 → 职务」(非数字字段顺序),
 *   评分 = 行内的数字列(自动认)。从 Excel/表格复制粘贴(Tab 分隔)最适配。
 *   列顺序完全乱、或一段话式的,改用「AI 识别」(后端 /venue/ai/extract-roster)。
 *
 * 例:
 *   "张三\t机关党委\t部长\t10086"    → {name:张三, unit:机关党委, position:部长, empNo:10086}
 *   "李四,基层一公司,科员"           → {name:李四, unit:基层一公司, position:科员}
 *   "10086 王五"                     → {name:王五, empNo:10086}
 *   "赵六"                            → {name:赵六}
 */
export interface RosterLineParsed {
  name: string;
  empNo?: string;
  unit?: string;
  position?: string;
}

/** 全角 → 半角(全角 ASCII + 全角空格);源码不出现全角字形,规避 eslint no-irregular-whitespace */
function toHalfWidth(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code === 0x3000) out += " ";
    else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0);
    else out += ch;
  }
  return out;
}

// 列分隔:空格(含多个)/ Tab / 中英文逗号分号顿号 / 竖线。
// 任意空白都切 —— 「王五 90」这种手敲单空格也能拆出评分;含空格的列内容(罕见)
// 请改用 Tab/逗号分隔,或用「AI 智能识别」。
const COL_SEP = /[,，;；、|]+|\s+/;
const EMP_RE = /^\d{3,}$/; // 3+ 位纯数字 = 员工编号(评分已不在名单,改由拖拽顺序定优先级)

export function parseRosterLines(text: string): RosterLineParsed[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => toHalfWidth(line).trim())
    .filter(Boolean)
    .map((line): RosterLineParsed | null => {
      const cols = line
        .split(COL_SEP)
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length === 0) return null;
      let empNo: string | undefined;
      const rest: string[] = [];
      for (const c of cols) {
        if (EMP_RE.test(c)) empNo = c; // 3+ 位数字 = 工号
        else rest.push(c);
      }
      const name = rest[0] ?? "";
      if (!name) return null;
      const result: RosterLineParsed = { name };
      if (empNo) result.empNo = empNo;
      if (rest[1]) result.unit = rest[1];
      if (rest[2]) result.position = rest[2];
      return result;
    })
    .filter((x): x is RosterLineParsed => x !== null);
}
