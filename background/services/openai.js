(function initOpenAIService(globalScope) {
  const DEFAULT_BASE_URL = "https://api.openai.com";
  const OPENAI_API_PATH = "/v1/chat/completions";
  const DEFAULT_MODEL = "gpt-4o-mini";
  const DEFAULT_TEMPERATURE = 1;
  const LOG_PREFIX = "[OpenAI]";

  const baseApi = globalScope?.baseService;
  if (!baseApi) {
    throw new Error("baseService is required for OpenAI service.");
  }

  const {
    createLogger,
    createConfigLoader,
    createMessageBuilder,
    requestWithFetch,
    registerService,
  } = baseApi;

  const log = createLogger(LOG_PREFIX);

  function normalizeApiBase(url) {
    if (typeof url !== "string") return DEFAULT_BASE_URL;
    const trimmed = url.trim();
    if (!trimmed) return DEFAULT_BASE_URL;
    const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    if (normalized === "http://api.openai.com") {
      return DEFAULT_BASE_URL;
    }
    return normalized;
  }

  const OPENAI_ERROR_HINTS = [
    {
      status: 401,
      keyword: "invalid authentication",
      message: "OpenAI 身份验证失败，请确认 API Key 以及组织信息填写正确。",
    },
    {
      status: 401,
      keyword: "incorrect api key provided",
      message: "OpenAI API Key 不正确，请确认 API Key 后再试。",
    },
    {
      status: 401,
      keyword: "must be a member of an organization",
      message:
        "当前账号未加入任何 OpenAI 组织，请联系管理员或 OpenAI 支持加入组织。",
    },
    {
      status: 401,
      keyword: "ip not authorized",
      message:
        "请求 IP 不在 OpenAI 允许列表，请从已授权的 IP 发送请求或更新允许列表。",
    },
    {
      status: 403,
      keyword: "not supported",
      message:
        "当前所在国家或地区无法使用 OpenAI API，请确认访问方案是否受限。",
    },
    {
      status: 429,
      keyword: "rate limit",
      message: "请求过于频繁，触发 OpenAI 限流，请降低调用频率后再重试。",
    },
    {
      status: 429,
      keyword: "exceeded your current quota",
      message: "已用尽当前配额或额度，请购买更多额度或调整计划后再次调用。",
    },
    {
      status: 500,
      keyword: "server had an error",
      message:
        "OpenAI 服务器内部错误，请稍等片刻后再试，如持续失败可查看状态页。",
    },
    {
      status: 503,
      keyword: "currently overloaded",
      message: "OpenAI 服务正忙，请稍后再提交请求，或改用流量较低时段。",
    },
    {
      status: 503,
      keyword: "slow down",
      message:
        "请求速率突增导致服务限流，请恢复到原有速率，稳定一段时间后再提升。",
    },
  ];

  const OPENAI_STATUS_FALLBACKS = {
    401: "OpenAI 身份验证未通过，请确认 API Key 与组织设置是否正确。",
    403: "OpenAI 拒绝了请求，请确认访问地区是否受支持。",
    429: "OpenAI 报告请求过多或额度不足，请减慢调用或检查额度。",
    500: "OpenAI 服务器出现错误，请稍后重试。",
    503: "OpenAI 服务暂时不可用，请稍后再试。",
  };

  function extractOpenAIErrorText(body) {
    if (!body || typeof body !== "string") {
      return "";
    }
    const trimmed = body.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) {
      // Avoid returning HTML payloads
      return "";
    }
    try {
      const parsed = JSON.parse(trimmed);
      const message = parsed?.error?.message;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // not JSON, fall through
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      // Looks like JSON but failed to parse; avoid showing raw payload
      return "";
    }
    return trimmed;
  }

  function buildOpenAIErrorMessage(errorInfo = {}) {
    const status = errorInfo.status || 0;
    const text = extractOpenAIErrorText(errorInfo.body);
    const normalizedText = text.toLowerCase();
    if (status) {
      const specific = OPENAI_ERROR_HINTS.find(
        (hint) =>
          hint.status === status &&
          normalizedText.includes(hint.keyword.toLowerCase()),
      );
      if (specific) {
        return specific.message;
      }
      const fallback = OPENAI_STATUS_FALLBACKS[status];
      if (fallback) {
        return text ? `${fallback}（${text}）` : fallback;
      }
    }
    if (text) {
      return `${text}`;
    }
    return "OpenAI 请求失败，请稍后再试。";
  }

  const loadOpenAIConfig = createConfigLoader({
    storageKeys: [
      "openai_apiKey",
      "openai_model",
      "openai_prompt",
      "openai_rules",
      "openai_temp",
      "openai_apiBaseUrl",
    ],
    defaults: {
      openai_apiBaseUrl: DEFAULT_BASE_URL,
      openai_model: DEFAULT_MODEL,
      openai_prompt: "",
      openai_rules: "",
      openai_temp: DEFAULT_TEMPERATURE,
    },
    deriveConfig(config) {
      return {
        apiKey: config.openai_apiKey?.trim() || "",
        apiBase: normalizeApiBase(config.openai_apiBaseUrl),
        model: config.openai_model?.trim() || DEFAULT_MODEL,
        prompt: config.openai_prompt?.trim() || "",
        rules: config.openai_rules?.trim() || "",
        temperature:
          typeof config.openai_temp === "number" &&
          Number.isFinite(config.openai_temp)
            ? config.openai_temp
            : DEFAULT_TEMPERATURE,
      };
    },
  });

  const buildMessages = createMessageBuilder({
    needsPrompt: false,
    needsRules: true,
    needsTerms: true,
    needsSourceText: true,
    requirePromptOrSource: true,
    missingPromptOrSourceMessage:
      "Prompt or source text must be provided for OpenAI request.",
    finalInstruction:
      "请将上述当前句段准确翻译为中文，只输出译文，不要附加说明。",
  });

  async function requestOpenAI({
    input,
    terms,
    context,
    temperature,
    signal,
    extraHeaders = {},
  } = {}) {
    const config = await loadOpenAIConfig();
    if (!config.apiKey) {
      throw new Error("OpenAI API key is not configured.");
    }

    log("Preparing request", {
      model: config.model,
      apiBase: config.apiBase,
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

    const requestUrl = `${config.apiBase}${OPENAI_API_PATH}`;

    let lastErrorInfo = null;
    try {
      const result = await requestWithFetch({
        url: requestUrl,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
        extraHeaders,
        errorMessage: "OpenAI API request failed",
        onError: (response, errorBody) => {
          lastErrorInfo = {
            status: response?.status,
            body: errorBody,
          };
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
        throw new Error(buildOpenAIErrorMessage(lastErrorInfo));
      }
      throw error;
    }
  }

  const openaiService = {
    loadConfig: loadOpenAIConfig,
    request: requestOpenAI,
  };

  registerService({
    id: "openai",
    service: openaiService,
  });

  if (typeof globalScope !== "undefined") {
    globalScope.openaiService = openaiService;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = openaiService;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
