import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// 1. 载入 HTML 模板
const html = fs.readFileSync(path.resolve("options/options.html"), "utf8");

const triggerDOMContentLoaded = () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
};

beforeAll(async () => {
  const alertMock = vi.fn();
  vi.stubGlobal("alert", alertMock);
  window.alert = alertMock;
  await import("../options/options.js");
});

beforeEach(() => {
  document.body.innerHTML = html;
});

describe("eLunaAsst Options Page", () => {
  it("默认加载 DeepSeek 配置并显示对应字段", () => {
    triggerDOMContentLoaded();

    const activeBtn = document.querySelector(".list-group-item.active");
    expect(activeBtn?.dataset.service).toBe("deepseek");

    const modelInput = document.getElementById("modelInput");
    const modelSelect = document.getElementById("modelSelect");
    const promptField = document.getElementById("promptField");
    const rulesField = document.getElementById("rulesField");
    const tempField = document.getElementById("temperatureField");

    expect(modelSelect?.classList.contains("d-none")).toBe(false);
    expect(modelInput?.classList.contains("d-none")).toBe(true);
    expect(promptField?.classList.contains("d-none")).toBe(false);
    expect(rulesField?.classList.contains("d-none")).toBe(false);
    expect(tempField?.classList.contains("d-none")).toBe(false);
  });

  it("切换到 DeepL 时显示 API 类型并隐藏模型/温度字段", () => {
    triggerDOMContentLoaded();

    const deepLBtn = document.querySelector('[data-service="deepl"]');
    deepLBtn?.click();

    const title = document.getElementById("service-title");
    const apiTypeField = document.getElementById("apiTypeField");
    const apiTypeSelect = document.getElementById("apiTypeSelect");
    const modelField = document.getElementById("modelField");
    const tempField = document.getElementById("temperatureField");
    const promptField = document.getElementById("promptField");
    const rulesField = document.getElementById("rulesField");

    expect(title?.textContent).toContain("DeepL");
    expect(apiTypeField?.classList.contains("d-none")).toBe(false);
    expect(apiTypeSelect?.value).toBe("free");
    expect(modelField?.classList.contains("d-none")).toBe(true);
    expect(tempField?.classList.contains("d-none")).toBe(true);
    expect(promptField?.classList.contains("d-none")).toBe(true);
    expect(rulesField?.classList.contains("d-none")).toBe(true);
  });

  it("加载已保存的 DeepSeek 设置", () => {
    chrome.storage.local.set({
      deepseek_apiKey: "KEY-123",
      deepseek_model: "deepseek-reasoner",
      deepseek_prompt: "Hello Prompt",
      deepseek_rules: "Rule set",
      deepseek_temp: 0.7,
    });

    triggerDOMContentLoaded();

    expect(document.getElementById("apiKeyInput")?.value).toBe("KEY-123");
    expect(document.getElementById("modelSelect")?.value).toBe("deepseek-reasoner");
    expect(document.getElementById("promptInput")?.value).toBe("Hello Prompt");
    expect(document.getElementById("rulesInput")?.value).toBe("Rule set");
    expect(document.getElementById("tempInput")?.value).toBe("0.7");
  });

  it("保存当前服务配置时写入 storage 并提示", async () => {
    triggerDOMContentLoaded();

    const apiKeyInput = document.getElementById("apiKeyInput");
    const modelSelect = document.getElementById("modelSelect");
    const promptInput = document.getElementById("promptInput");
    const rulesInput = document.getElementById("rulesInput");
    const tempInput = document.getElementById("tempInput");
    apiKeyInput.value = " ABC-123 ";
    modelSelect.value = "deepseek-reasoner";
    promptInput.value = " Prompt 内容 ";
    rulesInput.value = " Rule 内容 ";
    tempInput.value = "1.5";

    document.getElementById("saveBtn")?.click();

    await Promise.resolve();

    expect(chrome.storage.local.data.deepseek_apiKey).toBe("ABC-123");
    expect(chrome.storage.local.data.deepseek_model).toBe("deepseek-reasoner");
    expect(chrome.storage.local.data.deepseek_prompt).toBe("Prompt 内容");
    expect(chrome.storage.local.data.deepseek_rules).toBe("Rule 内容");
    expect(chrome.storage.local.data.deepseek_temp).toBe(1.5);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("DeepSeek 设置已保存"));
  });

  it("重置 OpenAI 配置时恢复默认值", () => {
    triggerDOMContentLoaded();
    document.querySelector('[data-service="openai"]')?.click();

    const apiKeyInput = document.getElementById("apiKeyInput");
    const modelSelect = document.getElementById("modelSelect");
    const promptInput = document.getElementById("promptInput");
    const rulesInput = document.getElementById("rulesInput");
    const tempInput = document.getElementById("tempInput");

    apiKeyInput.value = "something";
    modelSelect.value = "gpt-3.5-turbo";
    promptInput.value = "prompt";
    rulesInput.value = "rules";
    tempInput.value = "1.7";

    document.getElementById("resetBtn")?.click();

    expect(apiKeyInput.value).toBe("");
    expect(modelSelect.value).toBe("gpt-4o");
    expect(promptInput.value).toBe("");
    expect(rulesInput.value).toBe("");
    expect(tempInput.value).toBe("1");
  });
});
