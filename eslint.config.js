import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // background service worker 环境
  {
    files: ["background/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.webextensions,
        ...globals.worker,
        importScripts: "readonly",
        chrome: "readonly",
      },
    },
  },

  // Node 环境（测试、工具）
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },

  // 服务模块（允许 module.exports）
  {
    files: ["background/services/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.webextensions,
        ...globals.worker,
        chrome: "readonly",
        module: "readonly",
      },
    },
  },
]);
