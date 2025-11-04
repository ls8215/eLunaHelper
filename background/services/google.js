(function initGoogleService(globalScope) {
  const GOOGLE_TRANSLATE_URL =
    "https://translation.googleapis.com/language/translate/v2";
  const DEFAULT_TARGET_LANG = "zh-CN";
  const LOG_PREFIX = "[Google]";
  const DEBUG_STORAGE_KEY = "debug";
  let debugEnabled = false;

  function setDebugLogging(value) {
    debugEnabled = Boolean(value);
  }

  if (typeof chrome !== "undefined" && chrome?.storage?.local?.get) {
    chrome.storage.local.get([DEBUG_STORAGE_KEY], (res) => {
      setDebugLogging(res?.[DEBUG_STORAGE_KEY]);
    });
    if (typeof chrome.storage?.onChanged?.addListener === "function") {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (!Object.prototype.hasOwnProperty.call(changes, DEBUG_STORAGE_KEY))
          return;
        setDebugLogging(changes[DEBUG_STORAGE_KEY].newValue);
      });
    }
  }

  function getChromeStorage() {
    if (!chrome?.storage?.local?.get) {
      throw new Error(
        "chrome.storage.local API is unavailable in this context.",
      );
    }
    return chrome.storage.local;
  }

  function log(...args) {
    try {
      if (!debugEnabled) return;
      console.log(LOG_PREFIX, ...args);
    } catch {
      // ignore logging failures
    }
  }

  function normalizeLang(value, fallback) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  async function loadGoogleConfig() {
    const storage = getChromeStorage();
    const keys = ["google_apiKey", "google_sourceLang", "google_targetLang"];

    const config = await new Promise((resolve) => storage.get(keys, resolve));

    const result = {
      apiKey: config.google_apiKey?.trim() || "",
      sourceLang: normalizeLang(config.google_sourceLang, ""),
      targetLang: normalizeLang(config.google_targetLang, DEFAULT_TARGET_LANG),
    };

    log("Config loaded", {
      hasApiKey: Boolean(result.apiKey),
      sourceLang: result.sourceLang || "(auto)",
      targetLang: result.targetLang,
    });

    return result;
  }

  async function requestGoogle({
    input,
    sourceLang,
    targetLang,
    terms,
    signal,
    extraHeaders = {},
  } = {}) {
    const config = await loadGoogleConfig();
    if (!config.apiKey) {
      throw new Error("Google Translate API key is not configured.");
    }

    const text = typeof input === "string" ? input.trim() : "";
    if (!text) {
      throw new Error("Source text is empty.");
    }

    const resolvedTarget = normalizeLang(targetLang, config.targetLang);
    const resolvedSource = normalizeLang(sourceLang, config.sourceLang);

    log("Preparing request", {
      targetLang: resolvedTarget,
      hasSourceLang: Boolean(resolvedSource),
      termsCount: Array.isArray(terms) ? terms.length : 0,
      inputLength: text.length,
    });

    if (Array.isArray(terms) && terms.length > 0) {
      log(
        "Glossary terms supplied but not supported directly for Google Translate.",
      );
    }

    const payload = {
      q: text,
      target: resolvedTarget || DEFAULT_TARGET_LANG,
      format: "text",
    };

    if (resolvedSource) {
      payload.source = resolvedSource;
    }

    const query = new URLSearchParams({ key: config.apiKey });
    const requestUrl = `${GOOGLE_TRANSLATE_URL}?${query.toString()}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch (err) {
        errorBody = `failed to read error body: ${err.message}`;
      }
      throw new Error(
        `Google Translate API request failed with status ${response.status}: ${errorBody}`,
      );
    }

    const data = await response.json();
    const translation =
      data?.data?.translations?.[0]?.translatedText != null
        ? String(data.data.translations[0].translatedText)
        : "";

    log("Received response", {
      contentLength: translation.length,
      hasTranslations: Array.isArray(data?.data?.translations),
    });

    return {
      content: translation,
      raw: data,
    };
  }

  const googleService = {
    loadConfig: loadGoogleConfig,
    request: requestGoogle,
  };

  if (typeof globalScope !== "undefined") {
    globalScope.googleService = googleService;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = googleService;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
