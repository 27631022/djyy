// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'prisma/seed.ts',
      'prisma/migrations/**',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // 把 src/<dir>/ 每个目录视为一个独立模块
      'boundaries/elements': [
        {
          type: 'module',
          pattern: 'src/*',
          mode: 'folder',
        },
      ],
      'boundaries/include': ['src/**/*.ts'],
    },
    rules: {
      // 核心规则:跨模块只能通过 index.ts(barrel)入口
      // import { X } from '../foo'   ✓ — 走 src/foo/index.ts
      // import { X } from '../foo/foo.service'   ✗ — 深 import 被禁
      'boundaries/entry-point': ['error', {
        default: 'disallow',
        rules: [
          { target: ['module'], allow: 'index.ts' },
        ],
      }],

      // 项目里有不少 catch (e: any),先放行做 warning
      '@typescript-eslint/no-explicit-any': 'warn',
      // _ 前缀的参数允许未使用
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // NestJS 的依赖注入装饰器会让 TS 觉得有些 metadata 是 unused,实际并非
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
