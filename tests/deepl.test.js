import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

let deeplService;

beforeAll(async () => {
  await import("../background/services/deepl.js");
  deeplService = self.deeplService;
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("deeplService", () => {
  it("loadConfig 会裁剪字段并解析 API 类型", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "  KEY-123  ",
      deepl_apiType: "pro",
    });

    const config = await deeplService.loadConfig();

    expect(config.apiKey).toBe("KEY-123");
    expect(config.apiType).toBe("pro");
    expect(config.apiBase).toBe("https://api.deepl.com");
  });

  it("request 会发送 DeepL 翻译请求并返回内容", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "KEY-777",
      deepl_apiType: "free",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [
          {
            text: "翻译结果",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deeplService.request({
      input: "  待翻译文本  ",
      sourceLang: " en ",
      targetLang: " zh ",
      terms: [{ source: "Hello", target: "你好" }],
      extraHeaders: {
        "X-Trace": "deepl",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("DeepL-Auth-Key KEY-777");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(options.headers["X-Trace"]).toBe("deepl");

    const params = new URLSearchParams(options.body);
    expect(params.get("text")).toBe("待翻译文本");
    expect(params.get("target_lang")).toBe("ZH");
    expect(params.get("source_lang")).toBe("EN");
    expect(params.get("preserve_formatting")).toBe("1");
    expect(params.get("split_sentences")).toBe("0");

    expect(result).toEqual({
      content: "翻译结果",
      raw: {
        translations: [
          {
            text: "翻译结果",
          },
        ],
      },
    });
  });

  it("request 会在缺少 API 密钥时抛出错误", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "",
    });

    await expect(
      deeplService.request({
        input: "Hello",
      })
    ).rejects.toThrow("DeepL API key is not configured.");
  });

  it("request 会在源文本为空时抛出错误", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "KEY-EMPTY",
    });

    await expect(
      deeplService.request({
        input: "   ",
      })
    ).rejects.toThrow("Source text is empty.");
  });

  it("request 会在响应失败时抛出错误", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "KEY-ERR",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deeplService.request({
        input: "Test",
      })
    ).rejects.toThrow("DeepL API request failed with status 403: forbidden");
  });

  it("queryUsage 会返回用量信息", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "KEY-USAGE",
      deepl_apiType: "pro",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        character_count: 1234,
        character_limit: 500000,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deeplService.queryUsage({
      extraHeaders: {
        "X-Trace": "usage",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepl.com/v2/usage");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("DeepL-Auth-Key KEY-USAGE");
    expect(options.headers["X-Trace"]).toBe("usage");

    expect(result).toEqual({
      character_count: 1234,
      character_limit: 500000,
    });
  });

  it("queryUsage 会在缺少 API 密钥时抛出错误", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "",
    });

    await expect(deeplService.queryUsage()).rejects.toThrow("DeepL API key is not configured.");
  });

  it("queryUsage 会在响应失败时抛出错误", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "KEY-FAIL",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deeplService.queryUsage()).rejects.toThrow(
      "DeepL usage request failed with status 429: rate limited"
    );
  });
});
