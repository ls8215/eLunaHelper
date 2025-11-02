// tests/setup.js
import { beforeEach } from "vitest";

// 模拟 chrome API
global.chrome = {
  storage: {
    local: {
      data: {},
      get(keys, cb) {
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach((k) => (result[k] = this.data[k]));
          cb(result);
        } else if (keys === null) {
          cb(this.data);
        } else {
          cb({ [keys]: this.data[keys] });
        }
      },
      set(obj, cb = () => {}) {
        Object.assign(this.data, obj);
        cb();
      },
      clear(cb = () => {}) {
        this.data = {};
        cb();
      },
    },
  },
};

// 每次测试前清空存储
beforeEach(() => {
  chrome.storage.local.clear();
});