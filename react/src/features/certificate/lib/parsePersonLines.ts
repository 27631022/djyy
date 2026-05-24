/**
 * 多行粘贴解析 —— 用于证书发证 Step 3 个人录入。
 *
 * 把用户粘贴的多行文本(每行一个被表彰人)拆成 { name, empNo } 数组,
 * 之后前端再调 `usersApi.lookupByEmpNo` 一次性查回部门并回填。
 *
 * 分隔符:中文逗号「,」/ 英文逗号「,」/ 空白(空格、Tab、连续空白)。
 * empNo 启发式:行内任何「3 位以上纯数字」段视为员工号;其余视为姓名。
 * 多余的不识别字段(职务、备注等)忽略 —— 该工具只取 name + empNo。
 *
 * 例:
 *   "张三  10001"          → { name: "张三", empNo: "10001" }
 *   "李四,20003,综合处" → { name: "李四", empNo: "20003" }
 *   "王五"                 → { name: "王五", empNo: "" }       // 没员工号
 *   "10005 赵六"          → { name: "赵六", empNo: "10005" }  // 顺序无所谓
 *   ""                      → 忽略(空行不返回)
 */
export interface PersonLineParsed {
  name: string;
  empNo: string;
}

const EMP_NO_RE = /^\d{3,}$/;
const SEP_RE = /[\s,,\t]+/;

export function parsePersonLines(text: string): PersonLineParsed[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(SEP_RE).filter(Boolean);
      const empNo = parts.find((p) => EMP_NO_RE.test(p)) ?? "";
      const name = parts.find((p) => p !== empNo) ?? "";
      return { name, empNo };
    });
}
