const SERVICE_REGISTRY = {
  deepseek: {
    scriptPath: "services/deepseek.js",
    globalName: "deepseekService",
    instance: null,
  },
  deepl: {
    scriptPath: null,
    globalName: null,
    instance: null,
  },
  google: {
    scriptPath: null,
    globalName: null,
    instance: null,
  },
  openai: {
    scriptPath: null,
    globalName: null,
    instance: null,
  },
};

function loadService(provider) {
  const entry = SERVICE_REGISTRY[provider];
  if (!entry) {
    throw new Error(`Provider ${provider} not recognized.`);
  }

  if (!entry.scriptPath || !entry.globalName) {
    throw new Error(`Provider ${provider} is not implemented yet.`);
  }

  if (entry.instance) {
    return entry.instance;
  }

  try {
    self.importScripts(chrome.runtime.getURL(entry.scriptPath));
  } catch (err) {
    console.error(`[background] Failed to load ${provider} service`, err);
    throw new Error(`Provider ${provider} failed to load.`);
  }

  const service = self?.[entry.globalName];
  if (!service || typeof service.request !== "function") {
    throw new Error(`Provider ${provider} service is not ready.`);
  }

  entry.instance = service;
  console.log(`[background] ${provider} service loaded`);
  return service;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "translate") {
    return false;
  }

  const { text, provider, terms } = msg;
  const input = typeof text === "string" ? text : "";
  const normalizedTerms = Array.isArray(terms) ? terms : [];
  console.log("[background] received:", provider, input.slice(0, 50), normalizedTerms.length);

  if (!input.trim()) {
    sendResponse({ error: "Source text is empty." });
    return false;
  }

  (async () => {
    try {
      const service = loadService(provider);
      const { content } = await service.request({
        input,
        terms: normalizedTerms,
      });
      sendResponse({ translation: content || "" });
    } catch (error) {
      console.error("[background] request failed", error);
      sendResponse({ error: error?.message || "Translation request failed." });
    }
  })();

  return true;
});
