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

  const DEEPL_STATUS_MESSAGES = {
    400: "DeepL 请求参数有误，请检查必填参数、拼写及取值是否符合 API 要求。",
    403: "DeepL 身份验证失败，请确认订阅的 API 计划有效且 API Key 填写正确。",
    404: "DeepL 请求地址不存在，请检查 API Base 与路径配置是否正确。",
    413: "文本过长，超过 DeepL 支持的单次请求大小，请拆分文本后重试。",
    414: "DeepL 请求 URL 过长，请改用 POST 请求或减少 URL 参数长度。",
    429: "DeepL 请求过于频繁，请等待更长时间再试，或减少单次文本长度。",
    456: "DeepL 已达到字符额度限制，请在账户的 Cost Control 中提高上限。",
  };

  function buildServerErrorMessage(status) {
    if (status === 503) {
      return "DeepL 服务繁忙，请稍等片刻后再试。";
    }
    return "DeepL 服务器内部错误，如多次出现请联系支持。";
  }

  function extractDeepLErrorText(body) {
    if (!body || typeof body !== "string") {
      return "";
    }
    const trimmed = body.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) {
      return "";
    }
    try {
      const parsed = JSON.parse(trimmed);
      const message =
        parsed?.message ||
        parsed?.error?.message ||
        parsed?.error?.detail ||
        parsed?.error;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // not JSON
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return "";
    }
    return trimmed;
  }

  function buildDeepLErrorMessage(errorInfo = {}) {
    const status = Number(errorInfo.status) || 0;
    const text = extractDeepLErrorText(errorInfo.body);
    if (status >= 500 && status <= 599) {
      const serverMsg = buildServerErrorMessage(status);
      return text ? `${serverMsg}` : serverMsg;
    }
    if (DEEPL_STATUS_MESSAGES[status]) {
      return text
        ? `${DEEPL_STATUS_MESSAGES[status]}`
        : DEEPL_STATUS_MESSAGES[status];
    }
    if (text) {
      return `DeepL 请求失败：${text}`;
    }
    return "DeepL 请求失败，请稍后再试。";
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

    let lastErrorInfo = null;
    try {
      const result = await requestWithFetch({
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
          lastErrorInfo = {
            status: response?.status,
            body: errorBody,
          };
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
      lastErrorInfo = null;
      return result;
    } catch (error) {
      if (lastErrorInfo) {
        throw new Error(buildDeepLErrorMessage(lastErrorInfo));
      }
      throw error;
    }
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

    let lastErrorInfo = null;
    try {
      const data = await requestWithFetch({
        url: requestUrl,
        method: "GET",
        headers: {
          Authorization: `DeepL-Auth-Key ${config.apiKey}`,
        },
        signal,
        extraHeaders,
        errorMessage: "Usage request failed",
        onError: (response, errorBody) => {
          lastErrorInfo = {
            status: response?.status,
            body: errorBody,
          };
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
      lastErrorInfo = null;
      return data;
    } catch (error) {
      if (lastErrorInfo) {
        throw new Error(buildDeepLErrorMessage(lastErrorInfo));
      }
      throw error;
    }
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
