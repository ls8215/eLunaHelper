(function initDeepseekService(globalScope) {
  const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
  const DEFAULT_MODEL = "deepseek-chat";
  const DEFAULT_TEMPERATURE = 1;
  const LOG_PREFIX = "[DeepSeek]";

  const baseApi = globalScope?.baseService;
  if (!baseApi) {
    throw new Error("baseService is required for DeepSeek service.");
  }

  const {
    createLogger,
    createConfigLoader,
    createMessageBuilder,
    requestWithFetch,
    registerService,
  } = baseApi;

  const log = createLogger(LOG_PREFIX);

  const loadDeepseekConfig = createConfigLoader({
    storageKeys: [
      "deepseek_apiKey",
      "deepseek_model",
      "deepseek_prompt",
      "deepseek_rules",
      "deepseek_temp",
    ],
    defaults: {
      deepseek_model: DEFAULT_MODEL,
      deepseek_prompt: "",
      deepseek_rules: "",
      deepseek_temp: DEFAULT_TEMPERATURE,
    },
    deriveConfig(config) {
      return {
        apiKey: config.deepseek_apiKey?.trim() || "",
        model: config.deepseek_model?.trim() || DEFAULT_MODEL,
        prompt: config.deepseek_prompt?.trim() || "",
        rules: config.deepseek_rules?.trim() || "",
        temperature:
          typeof config.deepseek_temp === "number" &&
          Number.isFinite(config.deepseek_temp)
            ? config.deepseek_temp
            : DEFAULT_TEMPERATURE,
      };
    },
  });

  const DEEPSEEK_ERROR_HINTS = {
    400: "DeepSeek 请求格式有误，请根据提示检查请求体参数与格式。",
    401: "DeepSeek API Key 认证失败，请确认已创建并正确填写 API Key。",
    402: "DeepSeek 账号余额不足，请先充值后再尝试调用。",
    422: "DeepSeek 请求参数错误，请根据提示修改参数。",
    429: "DeepSeek 请求速率已达到上限，请合理规划请求频率。",
    500: "DeepSeek 服务器故障，请稍后重试，持续异常请联系支持。",
    503: "DeepSeek 服务器繁忙，请稍后重试。",
  };

  function extractDeepseekErrorText(body) {
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
        parsed?.error?.message ||
        parsed?.message ||
        parsed?.error ||
        parsed?.detail;
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

  function buildDeepseekErrorMessage(errorInfo = {}) {
    const status = Number(errorInfo.status) || 0;
    const text = extractDeepseekErrorText(errorInfo.body);
    if (DEEPSEEK_ERROR_HINTS[status]) {
      return text
        ? `${DEEPSEEK_ERROR_HINTS[status]}`
        : DEEPSEEK_ERROR_HINTS[status];
    }
    if (status >= 500 && status <= 599) {
      return text
        ? `DeepSeek 服务暂时不可用（${status}）：${text}`
        : "DeepSeek 服务暂时不可用，请稍后重试。";
    }
    if (text) {
      return `DeepSeek 请求失败：${text}`;
    }
    return "DeepSeek 请求失败，请稍后再试。";
  }

  const buildMessages = createMessageBuilder({
    needsPrompt: false,
    needsRules: true,
    needsTerms: true,
    needsSourceText: true,
    requirePromptOrSource: true,
    missingPromptOrSourceMessage:
      "Prompt or source text must be provided for DeepSeek request.",
    finalInstruction:
      "请将上述当前句段准确翻译为中文，只输出译文，不要附加说明。",
  });

  async function requestDeepseek({
    input,
    terms,
    context,
    temperature,
    signal,
    extraHeaders = {},
  } = {}) {
    const config = await loadDeepseekConfig();
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is not configured.");
    }

    log("Preparing request", {
      model: config.model,
      hasPrompt: Boolean(config.prompt),
      hasRules: Boolean(config.rules),
      termsCount: Array.isArray(terms) ? terms.length : 0,
      inputLength: typeof input === "string" ? input.length : 0,
      contextLength: typeof context === "string" ? context.length : 0,
    });

    const payload = {
      model: config.model,
      messages: buildMessages({
        prompt: config.prompt,
        rules: config.rules,
        terms,
        sourceText: input,
        contextText: context,
      }),
      temperature:
        typeof temperature === "number" && Number.isFinite(temperature)
          ? temperature
          : config.temperature,
      stream: false,
    };
    try {
      log("Outgoing messages", payload.messages);
    } catch {
      // ignore logging failures
    }

    let lastErrorInfo = null;
    try {
      const result = await requestWithFetch({
        url: DEEPSEEK_API_URL,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
        extraHeaders,
        errorMessage: "DeepSeek API request failed",
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
          const content = data?.choices?.[0]?.message?.content ?? "";

          log("Received response", {
            contentLength: typeof content === "string" ? content.length : 0,
            hasChoices: Array.isArray(data?.choices),
          });

          return {
            content,
            raw: data,
          };
        },
      });
      lastErrorInfo = null;
      return result;
    } catch (error) {
      if (lastErrorInfo) {
        throw new Error(buildDeepseekErrorMessage(lastErrorInfo));
      }
      throw error;
    }
  }

  async function queryDeepseekBalance({ signal, extraHeaders = {} } = {}) {
    const config = await loadDeepseekConfig();
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is not configured.");
    }

    const balanceUrl = "https://api.deepseek.com/v1/user/balance";

    log("Querying balance");

    let lastErrorInfo = null;
    try {
      const data = await requestWithFetch({
        url: balanceUrl,
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        signal,
        extraHeaders,
        errorMessage: "Balance request failed",
        onError: (response, errorBody) => {
          lastErrorInfo = {
            status: response?.status,
            body: errorBody,
          };
          log("Balance request failed", {
            status: response.status,
            bodyPreview: errorBody.slice(0, 200),
          });
        },
        parseResponse: async (response) => {
          const data = await response.json();

          log("Balance received", {
            hasBalance: data?.balance != null,
          });
          console.log("Balance received:", data);

          return data;
        },
      });
      lastErrorInfo = null;
      return data;
    } catch (error) {
      if (lastErrorInfo) {
        throw new Error(buildDeepseekErrorMessage(lastErrorInfo));
      }
      throw error;
    }
  }

  const deepseekService = {
    loadConfig: loadDeepseekConfig,
    request: requestDeepseek,
    queryBalance: queryDeepseekBalance,
  };

  registerService({
    id: "deepseek",
    service: deepseekService,
    queryHandlers: {
      default: queryDeepseekBalance,
    },
  });

  if (typeof globalScope !== "undefined") {
    globalScope.deepseekService = deepseekService;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = deepseekService;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
