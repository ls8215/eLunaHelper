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

    return requestWithFetch({
      url: DEEPSEEK_API_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
      extraHeaders,
      errorMessage: "DeepSeek API request failed",
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
  }

  async function queryDeepseekBalance({ signal, extraHeaders = {} } = {}) {
    const config = await loadDeepseekConfig();
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is not configured.");
    }

    const balanceUrl = "https://api.deepseek.com/v1/user/balance";

    log("Querying balance");

    return requestWithFetch({
      url: balanceUrl,
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal,
      extraHeaders,
      errorMessage: "Balance request failed",
      includeResponseBodyInError: false,
      onError: (response, errorBody) => {
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
