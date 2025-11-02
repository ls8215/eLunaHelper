import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom", // 模拟浏览器环境
    globals: true,        // 允许直接使用 describe/test/expect
    setupFiles: "./tests/setup.js" // 初始化mock
  },
});