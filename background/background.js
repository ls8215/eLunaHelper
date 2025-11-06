importScripts(
  "services/deepseek.js",
  "services/openai.js",
  "services/deepl.js",
  "services/google.js",
);

const SERVICE_REGISTRY = {
  deepseek: {
    globalName: "deepseekService",
    instance: null,
  },
  deepl: {
    globalName: "deeplService",
    instance: null,
  },
  google: {
    globalName: "googleService",
    instance: null,
  },
  openai: {
    globalName: "openaiService",
    instance: null,
  },
};

const FORMATTER_STORAGE_KEY = "translationFormatterEnabled";
let formatterEnabled = false;
let formatterModulePromise = null;

function setFormatterEnabled(value) {
  formatterEnabled = Boolean(value);
}

function loadFormatterModule() {
  if (!formatterModulePromise) {
    try {
      formatterModulePromise = import(
        chrome.runtime.getURL("utils/translationFormatter.js")
      );
    } catch (error) {
      formatterModulePromise = Promise.reject(error);
    }
  }
  return formatterModulePromise;
}

if (chrome?.storage?.local?.get) {
  chrome.storage.local.get([FORMATTER_STORAGE_KEY], (res) => {
    setFormatterEnabled(res?.[FORMATTER_STORAGE_KEY]);
  });
  if (typeof chrome.storage?.onChanged?.addListener === "function") {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName !== "local" ||
        !Object.prototype.hasOwnProperty.call(changes, FORMATTER_STORAGE_KEY)
      ) {
        return;
      }
      setFormatterEnabled(changes[FORMATTER_STORAGE_KEY].newValue);
    });
  }
}

function loadService(provider) {
  const entry = SERVICE_REGISTRY[provider];
  if (!entry) {
    throw new Error(`Provider ${provider} not recognized.`);
  }

  if (entry.instance) {
    return entry.instance;
  }

  const service = self?.[entry.globalName];
  if (!service || typeof service.request !== "function") {
    throw new Error(`Provider ${provider} service is not ready.`);
  }

  entry.instance = service;
  console.log(`[background] ${provider} service loaded`);
  return service;
}

const SERVICE_QUERY_HANDLERS = {
  deepl: async () => {
    const service = loadService("deepl");
    if (typeof service.queryUsage !== "function") {
      throw new Error("DeepL usage query is unavailable.");
    }
    return service.queryUsage();
  },
  deepseek: async () => {
    const service = loadService("deepseek");
    if (typeof service.queryBalance !== "function") {
      throw new Error("DeepSeek balance query is unavailable.");
    }
    return service.queryBalance();
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") {
    return false;
  }

  switch (msg.action) {
    case "translate": {
      const { text, provider, terms } = msg;
      const input = typeof text === "string" ? text : "";
      const normalizedTerms = Array.isArray(terms) ? terms : [];
      console.log(
        "[background] received:",
        provider,
        input.slice(0, 50),
        normalizedTerms.length,
      );

      if (!input.trim()) {
        sendResponse({ error: "Source text is empty." });
        return false;
      }

      (async () => {
        try {
          const service = loadService(provider);
          const { content } = await service.request({
            input,
            terms: normalizedTerms,
          });
          let translation = content || "";
          if (formatterEnabled && translation) {
            try {
              const { normalizeTranslation } = await loadFormatterModule();
              if (typeof normalizeTranslation === "function") {
                translation = normalizeTranslation(translation);
              }
            } catch (formatterError) {
              console.error(
                "[background] translation formatter failed",
                formatterError,
              );
            }
          }
          sendResponse({ translation });
        } catch (error) {
          console.error("[background] request failed", error);
          sendResponse({
            error: error?.message || "Translation request failed.",
          });
        }
      })();

      return true;
    }

    case "queryService": {
      const serviceId = msg?.service;
      if (typeof serviceId !== "string" || !serviceId.trim()) {
        sendResponse({ error: "Service identifier is required." });
        return false;
      }

      const handler = SERVICE_QUERY_HANDLERS[serviceId.trim()];
      if (typeof handler !== "function") {
        sendResponse({ error: `Service ${serviceId} does not support query.` });
        return false;
      }

      (async () => {
        try {
          const data = await handler();
          sendResponse({ ok: true, data });
        } catch (error) {
          console.error("[background] query failed", error);
          sendResponse({
            ok: false,
            error: error?.message || "Service query failed.",
          });
        }
      })();

      return true;
    }

    default:
      return false;
  }
});
