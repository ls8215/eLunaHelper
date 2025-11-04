(function initDeepLService(globalScope) {
  const API_BASES = {
    free: "https://api-free.deepl.com",
    pro: "https://api.deepl.com",
  };
  const TRANSLATE_PATH = "/v2/translate";
  const DEFAULT_API_TYPE = "free";
  const DEFAULT_TARGET_LANG = "ZH";
  const LOG_PREFIX = "[DeepL]";
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
        if (!Object.prototype.hasOwnProperty.call(changes, DEBUG_STORAGE_KEY)) return;
        setDebugLogging(changes[DEBUG_STORAGE_KEY].newValue);
      });
    }
  }

  function getChromeStorage() {
    if (!chrome?.storage?.local?.get) {
      throw new Error("chrome.storage.local API is unavailable in this context.");
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

  function sanitizeApiType(value) {
    if (value === "pro") return "pro";
    return DEFAULT_API_TYPE;
  }

  function resolveApiBase(apiType) {
    return API_BASES[apiType] || API_BASES[DEFAULT_API_TYPE];
  }

  function normalizeLang(value, fallback) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.toUpperCase();
  }

  async function loadDeepLConfig() {
    const storage = getChromeStorage();
    const keys = ["deepl_apiKey", "deepl_apiType"];

    const config = await new Promise((resolve) => storage.get(keys, resolve));
    const apiType = sanitizeApiType(config.deepl_apiType);

    const result = {
      apiKey: config.deepl_apiKey?.trim() || "",
      apiType,
      apiBase: resolveApiBase(apiType),
    };

    log("Config loaded", {
      apiType: result.apiType,
      hasApiKey: Boolean(result.apiKey),
    });

    return result;
  }

  async function requestDeepL({
    input,
    sourceLang,
    targetLang = DEFAULT_TARGET_LANG,
    terms,
    signal,
    extraHeaders = {},
  } = {}) {
    const config = await loadDeepLConfig();
    if (!config.apiKey) {
      throw new Error("DeepL API key is not configured.");
    }

    const text = typeof input === "string" && input.trim() ? input.trim() : undefined;
    if (!text) {
      throw new Error("Source text is empty.");
    }

    const resolvedTarget = normalizeLang(targetLang, DEFAULT_TARGET_LANG);
    const resolvedSource = normalizeLang(sourceLang, "");

    log("Preparing request", {
      apiType: config.apiType,
      targetLang: resolvedTarget,
      hasSourceLang: Boolean(resolvedSource),
      termsCount: Array.isArray(terms) ? terms.length : 0,
      inputLength: text.length,
    });

    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", resolvedTarget);
    if (resolvedSource) {
      params.append("source_lang", resolvedSource);
    }
    params.append("preserve_formatting", "1");
    params.append("split_sentences", "0");

    if (Array.isArray(terms) && terms.length > 0) {
      log("DeepL terms supplied but glossaries are not supported directly.");
    }

    const requestUrl = `${config.apiBase}${TRANSLATE_PATH}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `DeepL-Auth-Key ${config.apiKey}`,
        ...extraHeaders,
      },
      body: params.toString(),
      signal,
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch (err) {
        errorBody = `failed to read error body: ${err.message}`;
      }
      log("Request failed", {
        status: response.status,
        bodyPreview: errorBody.slice(0, 200),
      });
      throw new Error(`DeepL API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const translation = data?.translations?.[0]?.text ?? "";

    log("Received response", {
      contentLength: translation.length,
      hasTranslations: Array.isArray(data?.translations),
    });

    return {
      content: translation,
      raw: data,
    };
  }

  async function queryDeepLUsage({ signal, extraHeaders = {} } = {}) {
    const config = await loadDeepLConfig();
    if (!config.apiKey) {
      throw new Error("DeepL API key is not configured.");
    }

    const requestUrl = `${config.apiBase}/v2/usage`;

    log("Querying usage", {
      apiType: config.apiType,
    });

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Authorization: `DeepL-Auth-Key ${config.apiKey}`,
        ...extraHeaders,
      },
      signal,
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch (err) {
        errorBody = `failed to read error body: ${err.message}`;
      }
      log("Usage request failed", {
        status: response.status,
        bodyPreview: errorBody.slice(0, 200),
      });
      throw new Error(`DeepL usage request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    log("Usage received", {
      hasCharacterCount: data?.character_count != null,
      hasCharacterLimit: data?.character_limit != null,
    });

    return data;
  }

  const deeplService = {
    loadConfig: loadDeepLConfig,
    request: requestDeepL,
    queryUsage: queryDeepLUsage,
  };

  if (typeof globalScope !== "undefined") {
    globalScope.deeplService = deeplService;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = deeplService;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this);
