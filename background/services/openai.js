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

    return requestWithFetch({
      url: requestUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
      extraHeaders,
      errorMessage: "OpenAI API request failed",
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
