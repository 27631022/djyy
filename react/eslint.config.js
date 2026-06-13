import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // icon-zh.ts 是脚本生成文件(gen-icon-zh.cjs),不参与 lint(文件头的 eslint-disable 由生成器输出)
  { ignores: ["dist", "src/shared/components/icon-zh.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      boundaries,
    },
    settings: {
      // 把 src 下几类目录登记成 boundaries 的 "element"
      // 跨 element 引用只允许走 index.ts(barrel)入口,深 import 报错
      "boundaries/elements": [
        { type: "feature",  pattern: "src/features/*",  mode: "folder" },
        { type: "shared",   pattern: "src/shared/*",    mode: "folder" },
        { type: "layout",   pattern: "src/layouts/*",   mode: "file"   },
        { type: "page",     pattern: "src/pages/*",     mode: "file"   },
        { type: "store",    pattern: "src/stores/*",    mode: "file"   },
      ],
      "boundaries/include": ["src/**/*.{ts,tsx}"],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // 真正会引发 bug 的规则保持 error:
      //   unused 是 Vite + AutoImport 静默失败的元凶,必须 error
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],

      // React 19 + react-hooks v7 引入的新规则,过于激进
      //   "useEffect 里 setState" 在很多合法 pattern 里都会触发(如从 props 同步状态)
      //   降级为 warning,让你看到但不阻塞
      "react-hooks/set-state-in-effect": "warn",

      // 允许 explicit any —— 实际工程里少量必要的 any 比"装作有类型"更诚实
      //   降级为 warning,鼓励但不强制
      "@typescript-eslint/no-explicit-any": "warn",

      // 表达式语句(如 `x && doSomething()`)虽然不推荐,但有时是清晰写法
      "@typescript-eslint/no-unused-expressions": "warn",

      // 跨 feature/shared 等 element 只能走 barrel(index.ts),禁止深 import
      //   ❌ import { X } from "@/features/user/api"           — 深 import
      //   ❌ import { X } from "@/features/user/pages/Users"    — 深 import
      //   ✓  import { X } from "@/features/user"              — 走 features/user/index.ts
      // 详见 docs/conventions.md 「前端模块化约束」
      "boundaries/entry-point": ["error", {
        default: "disallow",
        rules: [
          { target: ["feature", "shared"], allow: "index.ts" },
        ],
      }],
    },
  },
  {
    // 类型声明文件(*.d.ts)允许空 interface 等历史兼容写法
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // shadcn/ui 是 vendor 代码(从模板复制,非我们维护),按它本身的风格
    files: ["src/shared/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/refs": "off",
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // 字段类型注册表:fields/<type>.tsx 导出的是「字段类型定义对象」(内含该类型的预览 / 属性渲染),
    // 属于注册表模块而非纯组件模块 —— react-refresh 的「只导出组件」对它无意义(这些只读预览无需热更新)。
    // 关掉后,加新字段类型 = 新建一个 fields/<type>.tsx(惯常 PascalCase 组件写法)+ 在 registry 注册一行,无额外噪声。
    files: ["src/features/task/fields/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Context store:Provider 组件 + useXxx hook 同文件是 React 官方惯例(两者共享同一 createContext),
    // 拆开只为满足 fast-refresh 反而引入循环引用风险 —— 这类文件改动本就整页刷新,关掉无损。
    files: ["src/stores/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // 考核计分工具 / 数据源注册表:scoring/<type> 与 data-sources/ 导出的是「定义对象 + 查询函数」,
    // 属注册表模块而非纯组件模块(同 task/fields/*.tsx 先例)。关掉「只导出组件」对它无意义。
    files: ["src/features/assessment/scoring/*.{ts,tsx}", "src/features/assessment/data-sources/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
