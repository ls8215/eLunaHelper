import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

let openaiService;

beforeAll(async () => {
  await import("../background/services/baseService.js");
  await import("../background/services/openai.js");
  openaiService = self.openaiService;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("openaiService", () => {
  it("loadConfig 会标准化 API 基址并裁剪字段", async () => {
    chrome.storage.local.set({
      openai_apiKey: "  KEY-001  ",
      openai_model: "  gpt-4o  ",
      openai_prompt: "  Prompt  ",
      openai_rules: "  Rules  ",
      openai_temp: 0.75,
      openai_apiBaseUrl: " https://custom.example.com/ ",
    });

    const config = await openaiService.loadConfig();

    expect(config.apiKey).toBe("KEY-001");
    expect(config.model).toBe("gpt-4o");
    expect(config.prompt).toBe("Prompt");
    expect(config.rules).toBe("Rules");
    expect(config.temperature).toBe(0.75);
    expect(config.apiBase).toBe("https://custom.example.com");
  });

  it("request 会使用配置的基础地址发送 OpenAI 请求", async () => {
    chrome.storage.local.set({
      openai_apiKey: "KEY-XYZ",
      openai_model: "gpt-4o-mini",
      openai_prompt: "System prompt",
      openai_rules: "Follow the rules strictly.",
      openai_temp: 0.6,
      openai_apiBaseUrl: "http://api.openai.com",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "翻译结果",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const contextText =
      "【前文1】\n原文：Context source\n译文：Context translation";
    const result = await openaiService.request({
      input: "Original sentence.",
      terms: [
        { source: "TermA", target: "术语A" },
        { source: "TermB", target: "" },
      ],
      context: contextText,
      temperature: 0.9,
      extraHeaders: {
        "X-Custom": "trace",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer KEY-XYZ");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Custom"]).toBe("trace");

    const payload = JSON.parse(options.body);
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.temperature).toBe(0.9);
    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages[0]).toEqual({
      role: "system",
      content: "System prompt",
    });
    expect(payload.messages[1].content).toContain("项目规则");
    expect(payload.messages[1].content).toContain("术语");
    expect(payload.messages[1].content).toContain("TermB");
    expect(payload.messages[1].content).toContain("Original sentence.");
    expect(payload.messages[1].content).toContain("当前句段（需要翻译）");
    expect(payload.messages[1].content).toContain(
      "以下是用于参考的前文（用于理解语境和确定术语，不需要翻译）",
    );
    expect(payload.messages[1].content).toContain("【前文1】");

    expect(result).toEqual({
      content: "翻译结果",
      raw: {
        choices: [
          {
            message: {
              content: "翻译结果",
            },
          },
        ],
      },
    });
  });

  it("request 会在缺少 API 密钥时拒绝执行", async () => {
    chrome.storage.local.set({
      openai_model: "gpt-4o-mini",
      openai_prompt: "Prompt",
      openai_rules: "",
      openai_temp: 0.5,
    });

    await expect(
      openaiService.request({
        input: "Needs API key",
      }),
    ).rejects.toThrow("OpenAI API key is not configured.");
  });

  it("request 会携带响应正文透传 API 错误", async () => {
    chrome.storage.local.set({
      openai_apiKey: "KEY-ERR",
      openai_model: "gpt-4o-mini",
      openai_prompt: "Prompt",
      openai_rules: "",
      openai_temp: 0.5,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      openaiService.request({
        input: "Hello",
      }),
    ).rejects.toThrow(
      "OpenAI 身份验证未通过，请确认 API Key 与组织设置是否正确。（unauthorized）",
    );
  });
});
