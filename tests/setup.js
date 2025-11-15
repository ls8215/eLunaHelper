// tests/setup.js
import { beforeEach } from "vitest";

// 模拟 chrome API
const storageListeners = [];

function notifyStorageListeners(changes, areaName = "local") {
  if (!changes || Object.keys(changes).length === 0) {
    return;
  }
  storageListeners.forEach((listener) => {
    try {
      listener(changes, areaName);
    } catch {
      // Swallow test listener errors so they don't break setup.
    }
  });
}

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
        const changes = {};
        Object.entries(obj || {}).forEach(([key, newValue]) => {
          const oldValue = this.data[key];
          this.data[key] = newValue;
          changes[key] = { oldValue, newValue };
        });
        cb();
        notifyStorageListeners(changes);
      },
      clear(cb = () => {}) {
        const changes = {};
        Object.entries(this.data).forEach(([key, oldValue]) => {
          changes[key] = { oldValue, newValue: undefined };
        });
        this.data = {};
        cb();
        notifyStorageListeners(changes);
      },
    },
    onChanged: {
      addListener(fn) {
        if (typeof fn === "function") {
          storageListeners.push(fn);
        }
      },
    },
  },
};

global.__triggerStorageChange = (changes, areaName = "local") => {
  notifyStorageListeners(changes, areaName);
};

// 每次测试前清空存储
beforeEach(() => {
  chrome.storage.local.clear();
});
