const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TEMPERATURE = 1;

function getChromeStorage() {
  if (!chrome?.storage?.local?.get) {
    throw new Error("chrome.storage.local API is unavailable in this context.");
  }
  return chrome.storage.local;
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

function buildMessages({ userContent, prompt, rules, messages }) {
  if (Array.isArray(messages) && messages.length > 0) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  const systemParts = [];
  if (prompt) systemParts.push(prompt);
  if (rules) systemParts.push(rules);

  const results = [];
  if (systemParts.length > 0) {
    results.push({
      role: "system",
      content: systemParts.join("\n\n"),
    });
  }

  if (userContent) {
    results.push({
      role: "user",
      content: userContent,
    });
  }

  if (results.length === 0) {
    throw new Error("No messages provided for DeepSeek request.");
  }

  return results;
}

async function requestDeepseek({ input, messages, temperature, signal, extraHeaders = {} } = {}) {
  const config = await loadDeepseekConfig();
  if (!config.apiKey) {
    throw new Error("DeepSeek API key is not configured.");
  }

  const payload = {
    model: config.model,
    messages: buildMessages({
      userContent: input,
      prompt: config.prompt,
      rules: config.rules,
      messages,
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
