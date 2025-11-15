import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

let googleService;

beforeAll(async () => {
  await import("../background/services/baseService.js");
  await import("../background/services/google.js");
  googleService = self.googleService;
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("googleService", () => {
  it("loadConfig 会裁剪并提供默认值", async () => {
    chrome.storage.local.set({
      google_apiKey: "  KEY-123  ",
      google_sourceLang: " en ",
      google_targetLang: " zh-CN ",
    });

    const config = await googleService.loadConfig();

    expect(config).toEqual({
      apiKey: "KEY-123",
      sourceLang: "en",
      targetLang: "zh-CN",
    });
  });

  it("request 会发送 Google 翻译请求并返回结果", async () => {
    chrome.storage.local.set({
      google_apiKey: "KEY-ABC",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          translations: [
            {
              translatedText: "你好",
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleService.request({
      input: "Hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      terms: [{ source: "Hello", target: "你好" }],
      extraHeaders: {
        "X-Trace": "google",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://translation.googleapis.com/language/translate/v2?key=KEY-ABC",
    );
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Trace"]).toBe("google");

    const payload = JSON.parse(options.body);
    expect(payload).toEqual({
      q: "Hello",
      target: "zh-CN",
      source: "en",
      format: "text",
    });

    expect(result).toEqual({
      content: "你好",
      raw: {
        data: {
          translations: [
            {
              translatedText: "你好",
            },
          ],
        },
      },
    });
  });

  it("request 会在缺少 API 密钥时抛出错误", async () => {
    chrome.storage.local.set({
      google_apiKey: "",
    });

    await expect(
      googleService.request({
        input: "Test",
      }),
    ).rejects.toThrow("Google Translate API key is not configured.");
  });

  it("request 会在源文本为空时抛出错误", async () => {
    chrome.storage.local.set({
      google_apiKey: "KEY-XYZ",
    });

    await expect(
      googleService.request({
        input: "   ",
      }),
    ).rejects.toThrow("Source text is empty.");
  });

  it("request 会在响应失败时抛出错误", async () => {
    chrome.storage.local.set({
      google_apiKey: "KEY-ERR",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      googleService.request({
        input: "Test",
      }),
    ).rejects.toThrow("forbidden");
  });
});
