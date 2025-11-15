(function initDeepLService(globalScope) {
  const API_BASES = {
    free: "https://api-free.deepl.com",
    pro: "https://api.deepl.com",
  };
  const TRANSLATE_PATH = "/v2/translate";
  const DEFAULT_API_TYPE = "free";
  const DEFAULT_TARGET_LANG = "ZH";
  const LOG_PREFIX = "[DeepL]";

  const baseApi = globalScope?.baseService;
  if (!baseApi) {
    throw new Error("baseService is required for DeepL service.");
  }

  const {
    createLogger,
    createConfigLoader,
    requestWithFetch,
    registerService,
  } = baseApi;

  const log = createLogger(LOG_PREFIX);

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

  const loadDeepLConfig = createConfigLoader({
    storageKeys: ["deepl_apiKey", "deepl_apiType"],
    defaults: {
      deepl_apiType: DEFAULT_API_TYPE,
    },
    deriveConfig(config) {
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
    },
  });

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

    const text =
      typeof input === "string" && input.trim() ? input.trim() : undefined;
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

    if (Array.isArray(terms) && terms.length > 0) {
      log("DeepL terms supplied but glossaries are not supported directly.");
    }

    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", resolvedTarget);
    if (resolvedSource) {
      params.append("source_lang", resolvedSource);
    }
    params.append("preserve_formatting", "1");
    params.append("split_sentences", "0");

    const requestUrl = `${config.apiBase}${TRANSLATE_PATH}`;

    return requestWithFetch({
      url: requestUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `DeepL-Auth-Key ${config.apiKey}`,
      },
      body: params.toString(),
      signal,
      extraHeaders,
      errorMessage: "DeepL API request failed",
      onError: (response, errorBody) => {
        log("Request failed", {
          status: response.status,
          bodyPreview: errorBody.slice(0, 200),
        });
      },
      parseResponse: async (response) => {
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
      },
    });
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

    return requestWithFetch({
      url: requestUrl,
      method: "GET",
      headers: {
        Authorization: `DeepL-Auth-Key ${config.apiKey}`,
      },
      signal,
      extraHeaders,
      errorMessage: "Usage request failed",
      includeResponseBodyInError: false,
      onError: (response, errorBody) => {
        log("Usage request failed", {
          status: response.status,
          bodyPreview: errorBody.slice(0, 200),
        });
      },
      parseResponse: async (response) => {
        const data = await response.json();

        log("Usage received", {
          hasCharacterCount: data?.character_count != null,
          hasCharacterLimit: data?.character_limit != null,
        });

        return data;
      },
    });
  }

  const deeplService = {
    loadConfig: loadDeepLConfig,
    request: requestDeepL,
    queryUsage: queryDeepLUsage,
  };

  registerService({
    id: "deepl",
    service: deeplService,
    queryHandlers: {
      default: queryDeepLUsage,
    },
  });

  if (typeof globalScope !== "undefined") {
    globalScope.deeplService = deeplService;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = deeplService;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
