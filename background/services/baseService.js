(function initBaseService(globalScope) {
  const DEBUG_STORAGE_KEY = "debug";
  const DEFAULT_INSTRUCTION_LABEL = "任务";
  let debugEnabled = false;
  let debugInitialized = false;

  const serviceEntries = new Map();

  function getChromeStorage() {
    if (!chrome?.storage?.local?.get) {
      throw new Error(
        "chrome.storage.local API is unavailable in this context.",
      );
    }
    return chrome.storage.local;
  }

  function setDebugLogging(value) {
    debugEnabled = Boolean(value);
  }

  function ensureDebugSetup() {
    if (debugInitialized) {
      return;
    }
    debugInitialized = true;
    if (typeof chrome?.storage?.local?.get === "function") {
      chrome.storage.local.get([DEBUG_STORAGE_KEY], (res) => {
        setDebugLogging(res?.[DEBUG_STORAGE_KEY]);
      });
    }
    if (typeof chrome?.storage?.onChanged?.addListener === "function") {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
          areaName !== "local" ||
          !Object.prototype.hasOwnProperty.call(changes, DEBUG_STORAGE_KEY)
        ) {
          return;
        }
        setDebugLogging(changes[DEBUG_STORAGE_KEY].newValue);
      });
    }
  }

  function createLogger(prefix) {
    ensureDebugSetup();
    return function log(...args) {
      try {
        if (!debugEnabled) return;
        console.log(prefix, ...args);
      } catch {
        // ignore logging failures
      }
    };
  }

  function createConfigLoader({
    storageKeys,
    defaults = {},
    deriveConfig,
    storageArea,
  } = {}) {
    if (!Array.isArray(storageKeys) || storageKeys.length === 0) {
      throw new Error("storageKeys must be a non-empty array.");
    }

    const uniqueKeys = [...new Set(storageKeys)];
    const area = storageArea || getChromeStorage();
    let cache = null;
    let pendingPromise = null;

    function hasOwn(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function mergeWithDefaults(raw) {
      const result = { ...defaults };
      uniqueKeys.forEach((key) => {
        if (hasOwn(raw, key)) {
          result[key] = raw[key];
        }
      });
      return result;
    }

    if (typeof chrome?.storage?.onChanged?.addListener === "function") {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        const relevant = uniqueKeys.some((key) => hasOwn(changes, key));
        if (relevant) {
          cache = null;
        }
      });
    }

    async function loadConfig() {
      if (cache) return cache;
      if (!pendingPromise) {
        pendingPromise = new Promise((resolve, reject) => {
          area.get(uniqueKeys, (items) => {
            if (chrome.runtime?.lastError) {
              reject(
                new Error(
                  `Failed to load config: ${chrome.runtime.lastError.message}`,
                ),
              );
              pendingPromise = null;
              return;
            }

            try {
              const merged = mergeWithDefaults(items || {});
              cache =
                typeof deriveConfig === "function"
                  ? deriveConfig(merged)
                  : merged;
              resolve(cache);
            } catch (error) {
              reject(error);
            } finally {
              pendingPromise = null;
            }
          });
        });
      }
      return pendingPromise;
    }

    return loadConfig;
  }

  function createMessageBuilder({
    needsPrompt = true,
    needsRules = true,
    needsTerms = true,
    needsSourceText = true,
    finalInstruction = "",
    requirePromptOrSource = false,
    missingPromptOrSourceMessage = "Prompt or source text is required.",
    missingPromptMessage = "System prompt is required.",
    userRole = "user",
    systemRole = "system",
    rulesLabel = "项目规则",
    termsLabel = "术语对",
    sourceLabel = "原文",
    instructionLabel = DEFAULT_INSTRUCTION_LABEL,
  } = {}) {
    return function buildMessages({
      prompt,
      rules,
      terms,
      sourceText,
    } = {}) {
      const systemContent = typeof prompt === "string" ? prompt.trim() : "";
      const trimmedRules = typeof rules === "string" ? rules.trim() : "";
      const trimmedSource =
        typeof sourceText === "string" ? sourceText.trim() : "";

      if (needsPrompt && !systemContent) {
        throw new Error(missingPromptMessage);
      }

      if (
        requirePromptOrSource &&
        !systemContent &&
        (!trimmedSource || !trimmedSource.length)
      ) {
        throw new Error(missingPromptOrSourceMessage);
      }

      if (needsSourceText && !trimmedSource) {
        throw new Error("Source text is required.");
      }

      const messages = [
        {
          role: systemRole,
          content: systemContent,
        },
      ];

      const userParts = [];

      if (needsRules && trimmedRules) {
        userParts.push(`${rulesLabel}:\n${trimmedRules}`);
      }

      if (needsTerms && Array.isArray(terms) && terms.length > 0) {
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
          userParts.push(`${termsLabel}:\n${formattedTerms.join("\n")}`);
        }
      }

      if (needsSourceText && trimmedSource) {
        userParts.push(`${sourceLabel}:\n${trimmedSource}`);
      }

      if (finalInstruction) {
        userParts.push(`${instructionLabel}:\n${finalInstruction}`);
      }

      const userContent = userParts.join("\n\n").trim();

      if (!userContent) {
        throw new Error("User content is required for request.");
      }

      messages.push({
        role: userRole,
        content: userContent,
      });

      return messages;
    };
  }

  async function requestWithFetch({
    url,
    method = "POST",
    headers = {},
    body,
    bodyBuilder,
    signal,
    extraHeaders = {},
    parseResponse,
    errorMessage = "Request failed",
    fetchImpl,
    includeResponseBodyInError = true,
    onError,
  } = {}) {
    if (typeof url !== "string" || !url) {
      throw new Error("Request URL is required.");
    }
    const fetchFn =
      typeof fetchImpl === "function" ? fetchImpl : globalScope.fetch;
    if (typeof fetchFn !== "function") {
      throw new Error("Fetch API is unavailable in this context.");
    }

    const resolvedBody =
      typeof bodyBuilder === "function" ? await bodyBuilder() : body;

    const response = await fetchFn(url, {
      method,
      headers: {
        ...headers,
        ...extraHeaders,
      },
      body: resolvedBody,
      signal,
    });

    if (!response.ok) {
      let errorBody = "";
      if (includeResponseBodyInError || typeof onError === "function") {
        try {
          errorBody = await response.text();
        } catch (err) {
          errorBody = `failed to read error body: ${err?.message || String(err)}`;
        }
      }

      if (typeof onError === "function") {
        try {
          onError(response, errorBody);
        } catch {
          // ignore logging failures
        }
      }

      throw new Error(
        `${errorMessage} with status ${response.status}${
          errorBody ? `: ${errorBody}` : ""
        }`,
      );
    }

    if (typeof parseResponse === "function") {
      return parseResponse(response);
    }

    return response;
  }

  function registerService({
    id,
    service,
    queryHandlers = {},
    metadata = {},
  } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Service identifier is required.");
    }
    if (!service || typeof service.request !== "function") {
      throw new Error("Service definition must include a request function.");
    }
    const normalizedId = id.trim().toLowerCase();

    serviceEntries.set(normalizedId, {
      id: normalizedId,
      service,
      queryHandlers,
      metadata,
    });

    return normalizedId;
  }

  function getServiceEntry(id) {
    if (typeof id !== "string" || !id.trim()) {
      return null;
    }
    return serviceEntries.get(id.trim().toLowerCase()) || null;
  }

  function listServices() {
    return Array.from(serviceEntries.values());
  }

  const api = {
    createLogger,
    createConfigLoader,
    createMessageBuilder,
    requestWithFetch,
    registerService,
    getServiceEntry,
    listServices,
  };

  if (typeof globalScope !== "undefined") {
    globalScope.baseService = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
