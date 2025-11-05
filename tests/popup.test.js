import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.resolve("popup/popup.html"), "utf8");

const extractBody = (markup) => {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const body = template.content.querySelector("body");
  return body ? body.innerHTML : markup;
};

const renderPopup = () => {
  document.body.innerHTML = extractBody(html);
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const getCardElements = (serviceId) => {
  const card = document.querySelector(
    `.service-card[data-service="${serviceId}"]`,
  );
  if (!card) return {};
  return {
    card,
    badge: card.querySelector(".service-card__badge"),
    meta: card.querySelector(
      ".service-card__meta, .service-card__loading, .service-card__usage",
    ),
  };
};

const SERVICES = ["deepl", "deepseek", "google", "openai"];

beforeAll(async () => {
  const getURLMock = vi.fn((resource) => `chrome-extension://${resource}`);

  chrome.runtime = {
    getURL: getURLMock,
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(),
  };

  await import("../popup/popup.js");
});

beforeEach(() => {
  chrome.runtime.sendMessage = vi.fn();
  chrome.runtime.openOptionsPage = vi.fn();
  chrome.runtime.getURL.mockClear?.();
  renderPopup();
});

describe("弹窗界面", () => {
  it("在未配置时将所有服务标记为未激活", async () => {
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flushPromises();

    SERVICES.forEach((serviceId) => {
      const { card, badge, meta } = getCardElements(serviceId);
      expect(card).toBeTruthy();
      expect(badge?.textContent).toBe("Inactive");
      expect(meta?.textContent).toBe(
        "Configure this service in Settings first",
      );
    });

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("在服务已配置时查询数据并更新状态徽章", async () => {
    chrome.storage.local.set({
      deepl_apiKey: "DEEPL-KEY",
      deepseek_apiKey: "DEEPSEEK-KEY",
      google_apiKey: "GOOGLE-KEY",
      openai_apiKey: "OPENAI-KEY",
    });

    chrome.runtime.sendMessage = vi.fn((message, callback) => {
      if (message.service === "deepl") {
        callback({
          ok: true,
          data: {
            character_count: 1200,
            character_limit: 5000,
          },
        });
      } else if (message.service === "deepseek") {
        callback({
          ok: true,
          data: {
            balance_infos: [
              {
                total_balance: "110.00",
                currency: "CNY",
              },
            ],
          },
        });
      } else {
        callback({ ok: false, error: "Unsupported" });
      }
    });

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flushPromises();

    const deepl = getCardElements("deepl");
    expect(deepl.badge?.textContent).toBe("Active");
    expect(deepl.meta?.textContent).toBe("Used 1,200 / 5,000 (24%)");

    const deepseek = getCardElements("deepseek");
    expect(deepseek.badge?.textContent).toBe("Active");
    expect(deepseek.meta?.textContent).toBe("Total balance 110.00 CNY");

    const google = getCardElements("google");
    expect(google.badge?.textContent).toBe("Active");
    expect(google.meta?.textContent).toBe(
      "Check usage in your Google Cloud dashboard",
    );

    const openai = getCardElements("openai");
    expect(openai.badge?.textContent).toBe("Active");
    expect(openai.meta?.textContent).toBe(
      "Check usage in your OpenAI dashboard",
    );

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    const requestedServices = chrome.runtime.sendMessage.mock.calls.map(
      ([payload]) => payload.service,
    );
    expect(requestedServices.sort()).toEqual(["deepl", "deepseek"]);
  });
});
