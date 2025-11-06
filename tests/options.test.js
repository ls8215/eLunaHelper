import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// 1. 载入 HTML 模板
const html = fs.readFileSync(path.resolve("options/options.html"), "utf8");

const toastMock = vi.fn();

vi.mock("../utils/toast.js", () => ({
  toast: toastMock,
}));

const flushAsync = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Allow extra tick so event handlers finish DOM updates before assertions
  await new Promise((resolve) => setTimeout(resolve, 10));
};

const triggerDOMContentLoaded = async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flushAsync();
};

const readStorage = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (res) => resolve(res));
  });

const readStorageValue = async (key) => {
  const result = await readStorage([key]);
  return result[key];
};

beforeAll(async () => {
  const getURLMock = vi.fn((resource) => {
    if (resource.startsWith("./") || resource.startsWith("../")) {
      return resource;
    }
    return `../${resource}`;
  });
  chrome.runtime = {
    getURL: getURLMock,
  };
  await import("../options/options.js");
});

beforeEach(() => {
  const alertMock = vi.fn();
  vi.stubGlobal("alert", alertMock);
  window.alert = alertMock;
  document.body.innerHTML = html;
  toastMock.mockClear();
});

describe("eLunaAsst Options Page", () => {
  it("默认显示 General 选项卡并预配置 DeepSeek 字段", async () => {
    await triggerDOMContentLoaded();

    const activeBtn = document.querySelector(".list-group-item.active");
    expect(activeBtn?.dataset.section).toBe("general");

    const generalSection = document.getElementById("section-general");
    const servicesSection = document.getElementById("section-services");
    expect(generalSection?.classList.contains("d-none")).toBe(false);
    expect(servicesSection?.classList.contains("d-none")).toBe(true);

    document.querySelector('[data-service="deepseek"]')?.click();
    await flushAsync();

    const modelInput = document.getElementById("modelInput");
    const modelSelect = document.getElementById("modelSelect");
    const promptField = document.getElementById("promptField");
    const rulesField = document.getElementById("rulesField");
    const tempField = document.getElementById("temperatureField");

    expect(modelSelect?.classList.contains("d-none")).toBe(false);
    expect(modelInput?.classList.contains("d-none")).toBe(true);
    expect(modelSelect?.value).toBe("deepseek-chat");
    expect(promptField?.classList.contains("d-none")).toBe(false);
    expect(rulesField?.classList.contains("d-none")).toBe(false);
    expect(tempField?.classList.contains("d-none")).toBe(false);
  });

  it("同步 debug 开关与 chrome.storage", async () => {
    chrome.storage.local.set({ debug: true });

    await triggerDOMContentLoaded();

    const debugToggle = document.getElementById("debugToggle");
    expect(debugToggle?.checked).toBe(true);

    debugToggle.checked = false;
    debugToggle.dispatchEvent(new Event("change"));
    expect(await readStorageValue("debug")).toBe(false);
  });

  it("同步译文格式化开关与 chrome.storage", async () => {
    chrome.storage.local.set({ translationFormatterEnabled: true });

    await triggerDOMContentLoaded();

    const formatterToggle = document.getElementById("formatterToggle");
    expect(formatterToggle?.checked).toBe(true);

    formatterToggle.checked = false;
    formatterToggle.dispatchEvent(new Event("change"));
    expect(await readStorageValue("translationFormatterEnabled")).toBe(false);
  });

  it("切换到 DeepL 时显示 API 类型并隐藏模型/温度字段", async () => {
    await triggerDOMContentLoaded();

    const deepLBtn = document.querySelector('[data-service="deepl"]');
    deepLBtn?.click();
    await flushAsync();

    const title = document.getElementById("service-title");
    const apiTypeField = document.getElementById("apiTypeField");
    const apiTypeSelect = document.getElementById("apiTypeSelect");
    const apiBaseField = document.getElementById("apiBaseField");
    const modelField = document.getElementById("modelField");
    const tempField = document.getElementById("temperatureField");
    const promptField = document.getElementById("promptField");
    const rulesField = document.getElementById("rulesField");

    expect(title?.textContent).toContain("DeepL");
    expect(apiTypeField?.classList.contains("d-none")).toBe(false);
    expect(apiBaseField?.classList.contains("d-none")).toBe(true);
    expect(apiTypeSelect?.value).toBe("free");
    expect(modelField?.classList.contains("d-none")).toBe(true);
    expect(tempField?.classList.contains("d-none")).toBe(true);
    expect(promptField?.classList.contains("d-none")).toBe(true);
    expect(rulesField?.classList.contains("d-none")).toBe(true);
  });

  it("加载已保存的 DeepSeek 设置", async () => {
    chrome.storage.local.set({
      deepseek_apiKey: "KEY-123",
      deepseek_model: "deepseek-reasoner",
      deepseek_prompt: "Hello Prompt",
      deepseek_rules: "Rule set",
      deepseek_temp: 0.7,
    });

    await triggerDOMContentLoaded();
    document.querySelector('[data-service="deepseek"]')?.click();
    await flushAsync();

    expect(document.getElementById("apiKeyInput")?.value).toBe("KEY-123");
    expect(document.getElementById("modelSelect")?.value).toBe(
      "deepseek-reasoner",
    );
    expect(document.getElementById("promptInput")?.value).toBe("Hello Prompt");
    expect(document.getElementById("rulesInput")?.value).toBe("Rule set");
    expect(document.getElementById("tempInput")?.value).toBe("0.7");
  });

  it("保存当前服务配置时写入 storage 并提示", async () => {
    await triggerDOMContentLoaded();

    const storageSetSpy = vi.spyOn(chrome.storage.local, "set");

    const deepseekBtn = document.querySelector('[data-service="deepseek"]');
    const generalBtn = document.querySelector('[data-section="general"]');
    generalBtn?.classList.remove("active");
    deepseekBtn?.classList.add("active");
    expect(
      document.querySelector(".list-group-item.active")?.dataset.service,
    ).toBe("deepseek");

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

    await flushAsync();

    const stored = await readStorage([
      "deepseek_apiKey",
      "deepseek_model",
      "deepseek_prompt",
      "deepseek_rules",
      "deepseek_temp",
    ]);
    expect(storageSetSpy).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.data).toHaveProperty(
      "deepseek_apiKey",
      "ABC-123",
    );
    storageSetSpy.mockRestore();

    expect(stored.deepseek_apiKey).toBe("ABC-123");
    expect(stored.deepseek_model).toBe("deepseek-reasoner");
    expect(stored.deepseek_prompt).toBe("Prompt 内容");
    expect(stored.deepseek_rules).toBe("Rule 内容");
    expect(stored.deepseek_temp).toBe(1.5);
    expect(toastMock).toHaveBeenCalledWith("DeepSeek 设置已保存！");
  });

  it("重置 OpenAI 配置时恢复默认值", async () => {
    await triggerDOMContentLoaded();
    document.querySelector('[data-service="openai"]')?.click();

    const apiKeyInput = document.getElementById("apiKeyInput");
    const modelSelect = document.getElementById("modelSelect");
    const apiBaseField = document.getElementById("apiBaseField");
    const apiBaseInput = document.getElementById("apiBaseInput");
    const promptInput = document.getElementById("promptInput");
    const rulesInput = document.getElementById("rulesInput");
    const tempInput = document.getElementById("tempInput");

    apiKeyInput.value = "something";
    modelSelect.value = "gpt-3.5-turbo";
    apiBaseInput.value = "https://custom.example.com";
    promptInput.value = "prompt";
    rulesInput.value = "rules";
    tempInput.value = "1.7";

    document.getElementById("resetBtn")?.click();
    await flushAsync();

    expect(apiKeyInput.value).toBe("");
    expect(modelSelect.value).toBe("gpt-4.1");
    expect(apiBaseField?.classList.contains("d-none")).toBe(false);
    expect(apiBaseInput.value).toBe("https://api.openai.com");
    expect(promptInput.value).toBe("");
    expect(rulesInput.value).toBe("");
    expect(tempInput.value).toBe("1");
  });
});
