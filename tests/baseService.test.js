import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

let baseApi;

beforeAll(async () => {
  const module = await import("../background/services/baseService.js");
  baseApi = module.default || module;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("baseService", () => {
  it("createMessageBuilder 会构建包含系统与用户消息的数组", () => {
    const buildMessages = baseApi.createMessageBuilder({
      needsPrompt: false,
      finalInstruction: "请按指定语言输出。",
    });

    const contextText = "【前文1】\n原文：Example source\n译文：示例译文";
    const messages = buildMessages({
      prompt: "  系统提示  ",
      rules: "遵循术语表",
      terms: [{ source: "term", target: "术语" }, { source: "only source" }],
      sourceText: " Hello ",
      contextText,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: "system",
      content: "系统提示",
    });
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("项目规则");
    expect(messages[1].content).toContain("术语");
    expect(messages[1].content).toContain("当前句段（需要翻译）");
    expect(messages[1].content).toContain(
      "以下是用于参考的前文（用于理解语境和确定术语，不需要翻译）",
    );
    expect(messages[1].content).toContain("【前文1】");
    expect(messages[1].content).toContain("请按指定语言输出。");
  });

  it("createMessageBuilder 默认直接拼接 finalInstruction 内容", () => {
    const buildMessages = baseApi.createMessageBuilder({
      needsPrompt: false,
      needsRules: false,
      needsTerms: false,
      needsSourceText: false,
      requirePromptOrSource: false,
    });

    const messages = buildMessages({
      finalInstruction: "请直接输出原句",
    });

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("请直接输出原句");
  });

  it("createConfigLoader 会缓存结果并在 storage 变更时失效", async () => {
    chrome.storage.local.set({
      foo_key: "  value  ",
    });

    const loadConfig = baseApi.createConfigLoader({
      storageKeys: ["foo_key"],
      defaults: { foo_key: "" },
      deriveConfig(config) {
        return {
          foo: config.foo_key.trim(),
        };
      },
    });

    const config1 = await loadConfig();
    expect(config1).toEqual({ foo: "value" });

    const config2 = await loadConfig();
    expect(config2).toBe(config1);

    chrome.storage.local.set({
      foo_key: "next",
    });
    global.__triggerStorageChange({
      foo_key: {
        newValue: "next",
      },
    });

    const config3 = await loadConfig();
    expect(config3).not.toBe(config1);
    expect(config3).toEqual({ foo: "next" });
  });

  it("createLogger 会在 debug 开启后输出日志", () => {
    chrome.storage.local.set({
      debug: false,
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const log = baseApi.createLogger("[TestLogger]");
    log("should be muted");
    expect(consoleSpy).not.toHaveBeenCalled();

    chrome.storage.local.set({
      debug: true,
    });

    log("visible", 123);
    expect(consoleSpy).toHaveBeenCalledWith("[TestLogger]", "visible", 123);

    consoleSpy.mockRestore();
  });

  it("createLogger 会在缺少 storage 通知时刷新最新设置", async () => {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = (obj, cb = () => {}) => {
      Object.entries(obj || {}).forEach(([key, newValue]) => {
        chrome.storage.local.data[key] = newValue;
      });
      cb();
    };

    chrome.storage.local.set({
      debug: false,
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const log = baseApi.createLogger("[FallbackLogger]");
      log("first");
      expect(consoleSpy).not.toHaveBeenCalled();

      chrome.storage.local.set({
        debug: true,
      });

      log("visible", 42);
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[FallbackLogger]",
        "visible",
        42,
      );
    } finally {
      consoleSpy.mockRestore();
      chrome.storage.local.set = originalSet;
    }
  });

  it("requestWithFetch 会在失败时包含响应正文", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    await expect(
      baseApi.requestWithFetch({
        url: "https://example.com",
        headers: { "X-Test": "1" },
        extraHeaders: { "X-Extra": "2" },
        fetchImpl: fetchMock,
        errorMessage: "Custom request failed",
      }),
    ).rejects.toThrow("Custom request failed with status 400: bad request");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["X-Test"]).toBe("1");
    expect(options.headers["X-Extra"]).toBe("2");
  });

  it("registerService 会登记并暴露查询处理函数", () => {
    const service = {
      request: vi.fn(),
    };
    const query = vi.fn();

    baseApi.registerService({
      id: "demo",
      service,
      queryHandlers: {
        default: query,
      },
      metadata: {
        title: "Demo",
      },
    });

    const entry = baseApi.getServiceEntry("demo");
    expect(entry).toBeTruthy();
    expect(entry.service).toBe(service);
    expect(entry.queryHandlers.default).toBe(query);
    expect(baseApi.listServices().some((item) => item.id === "demo")).toBe(
      true,
    );
  });
});
