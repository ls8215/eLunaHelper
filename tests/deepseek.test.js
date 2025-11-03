import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

let deepseekService;

beforeAll(async () => {
  await import("../background/services/deepseek.js");
  deepseekService = self.deepseekService;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("deepseekService", () => {
  it("loadConfig trims values and applies defaults", async () => {
    chrome.storage.local.set({
      deepseek_apiKey: "  API-123  ",
      deepseek_model: "  deepseek-reasoner  ",
      deepseek_prompt: "  Prompt here  ",
      deepseek_rules: "  Rule set  ",
      deepseek_temp: 0.6,
    });

    const config = await deepseekService.loadConfig();

    expect(config.apiKey).toBe("API-123");
    expect(config.model).toBe("deepseek-reasoner");
    expect(config.prompt).toBe("Prompt here");
    expect(config.rules).toBe("Rule set");
    expect(config.temperature).toBe(0.6);
  });

  it("request sends DeepSeek payload and returns content", async () => {
    chrome.storage.local.set({
      deepseek_apiKey: "KEY-456",
      deepseek_model: "deepseek-chat",
      deepseek_prompt: "System prompt",
      deepseek_rules: "Keep tone formal.",
      deepseek_temp: 0.4,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "翻译后的内容",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deepseekService.request({
      input: "Translate this sentence.",
      terms: [
        { source: "term A", target: "术语A" },
        { source: "term B", target: "" },
      ],
      temperature: 0.9,
      extraHeaders: {
        "X-Trace": "test",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer KEY-456");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Trace"]).toBe("test");

    const payload = JSON.parse(options.body);
    expect(payload.model).toBe("deepseek-chat");
    expect(payload.temperature).toBe(0.9);
    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages[0]).toEqual({
      role: "system",
      content: "System prompt",
    });
    expect(payload.messages[1].role).toBe("user");
    expect(payload.messages[1].content).toContain("项目规则");
    expect(payload.messages[1].content).toContain("术语对");
    expect(payload.messages[1].content).toContain("原文");
    expect(payload.messages[1].content).toContain("term B");
    expect(payload.messages[1].content).toContain("Translate this sentence.");

    expect(result).toEqual({
      content: "翻译后的内容",
      raw: {
        choices: [
          {
            message: {
              content: "翻译后的内容",
            },
          },
        ],
      },
    });
  });

  it("request throws when API key is missing", async () => {
    chrome.storage.local.set({
      deepseek_model: "deepseek-chat",
      deepseek_prompt: "prompt",
      deepseek_rules: "",
      deepseek_temp: 0.5,
    });

    await expect(
      deepseekService.request({
        input: "Hello world",
      })
    ).rejects.toThrow("DeepSeek API key is not configured.");
  });
});
