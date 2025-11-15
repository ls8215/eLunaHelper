importScripts(
  "services/baseService.js",
  "services/deepseek.js",
  "services/openai.js",
  "services/deepl.js",
  "services/google.js",
  "../utils/translationFormatter.js",
);

const FORMATTER_STORAGE_KEY = "translationFormatterEnabled";
let formatterEnabled = false;
const formatterApi = self.translationFormatter || null;

function setFormatterEnabled(value) {
  formatterEnabled = Boolean(value);
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

const baseApi = self.baseService;
if (!baseApi) {
  throw new Error("[background] baseService is unavailable.");
}
const debugLog = baseApi.createLogger("[background]");
const debugError = baseApi.createLogger("[background:error]");

function normalizeProviderId(provider) {
  if (typeof provider !== "string") return "";
  return provider.trim().toLowerCase();
}

function ensureServiceEntry(provider) {
  const normalized = normalizeProviderId(provider);
  if (!normalized) {
    throw new Error("Provider identifier is required.");
  }

  const entry = baseApi.getServiceEntry(normalized);

  if (!entry || !entry.service || typeof entry.service.request !== "function") {
    throw new Error(`Provider ${provider} service is not ready.`);
  }

  return entry;
}

function loadService(provider) {
  return ensureServiceEntry(provider).service;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") {
    return false;
  }

  switch (msg.action) {
    case "translate": {
      const { text, provider, terms, context } = msg;
      const input = typeof text === "string" ? text : "";
      const normalizedTerms = Array.isArray(terms) ? terms : [];
      const contextText = typeof context === "string" ? context.trim() : "";
      debugLog(
        "received:",
        provider,
        input.slice(0, 50),
        normalizedTerms.length,
        contextText.length,
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
            context: contextText,
          });
          let translation = content || "";
          if (formatterEnabled && translation) {
            try {
              if (formatterApi?.normalizeTranslation) {
                translation = formatterApi.normalizeTranslation(translation);
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
          debugError("request failed", error);
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

      let queryHandler;
      try {
        const entry = ensureServiceEntry(serviceId);
        queryHandler = entry?.queryHandlers?.default;
      } catch (error) {
        sendResponse({ error: error?.message || "Service loading failed." });
        return false;
      }

      if (typeof queryHandler !== "function") {
        sendResponse({ error: `Service ${serviceId} does not support query.` });
        return false;
      }

      (async () => {
        try {
          const data = await queryHandler();
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
