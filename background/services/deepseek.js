const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TEMPERATURE = 1;
const LOG_PREFIX = "[DeepSeek]";
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
  } catch (_err) {
    // ignore logging failures
  }
}

async function loadDeepseekConfig() {
  const storage = getChromeStorage();
  const keys = [
    "deepseek_apiKey",
    "deepseek_model",
    "deepseek_prompt",
    "deepseek_rules",
    "deepseek_temp",
  ];

  const config = await new Promise((resolve) => storage.get(keys, resolve));

  return {
    apiKey: config.deepseek_apiKey?.trim() || "",
    model: config.deepseek_model?.trim() || DEFAULT_MODEL,
    prompt: config.deepseek_prompt?.trim() || "",
    rules: config.deepseek_rules?.trim() || "",
    temperature:
      typeof config.deepseek_temp === "number"
        ? Number.isFinite(config.deepseek_temp)
          ? config.deepseek_temp
          : DEFAULT_TEMPERATURE
        : DEFAULT_TEMPERATURE,
  };
}

function buildMessages({ prompt, rules, terms, sourceText }) {
  const systemContent = typeof prompt === "string" ? prompt.trim() : "";
  const trimmedRules = typeof rules === "string" ? rules.trim() : "";
  const trimmedSource = typeof sourceText === "string" ? sourceText.trim() : "";

  if (!systemContent && !trimmedSource) {
    throw new Error("Prompt or source text must be provided for DeepSeek request.");
  }

  const messages = [
    {
      role: "system",
      content: systemContent,
    },
  ];

  const userParts = [];
  if (trimmedRules) {
    userParts.push(`项目规则:\n${trimmedRules}`);
  }

  if (Array.isArray(terms) && terms.length > 0) {
    const formattedTerms = terms
      .map(({ source, target }) => {
        const src = typeof source === "string" ? source.trim() : "";
        const tgt = typeof target === "string" ? target.trim() : "";
        if (!src && !tgt) return "";
        if (!tgt) return src;
        return `${src} -> ${tgt}`;
      })
      .filter(Boolean);

    if (formattedTerms.length > 0) {
      userParts.push(`术语对:\n${formattedTerms.join("\n")}`);
    }
  }

  if (trimmedSource) {
    userParts.push(`原文:\n${trimmedSource}`);
  }

  userParts.push("任务:\n请将上述原文准确翻译为中文，只输出译文，不要附加说明。");

  const userContent = userParts.join("\n\n").trim();

  if (!userContent) {
    throw new Error("User content is required for DeepSeek request.");
  }

  messages.push({
    role: "user",
    content: userContent,
  });

  return messages;
}

async function requestDeepseek({ input, terms, temperature, signal, extraHeaders = {} } = {}) {
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
  });

  const payload = {
    model: config.model,
    messages: buildMessages({
      prompt: config.prompt,
      rules: config.rules,
      terms,
      sourceText: input,
    }),
    temperature:
      typeof temperature === "number" && Number.isFinite(temperature)
        ? temperature
        : config.temperature,
    stream: false,
  };

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
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
    throw new Error(`DeepSeek API request failed with status ${response.status}: ${errorBody}`);
  }

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
}

const deepseekService = {
  loadConfig: loadDeepseekConfig,
  request: requestDeepseek,
};

if (typeof self !== "undefined") {
  self.deepseekService = deepseekService;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = deepseekService;
}
