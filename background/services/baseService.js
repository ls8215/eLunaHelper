(function initBaseService(globalScope) {
  const DEBUG_STORAGE_KEY = "debug";
  const DEFAULT_INSTRUCTION_LABEL = "";
  let debugEnabled = false;
  let debugInitialized = false;

  const serviceEntries = new Map();
  const STORAGE_INVALIDATORS_KEY =
    typeof Symbol === "function"
      ? Symbol.for("baseService.configInvalidators")
      : "__baseServiceConfigInvalidators__";
  const STORAGE_PATCHED_KEY =
    typeof Symbol === "function"
      ? Symbol.for("baseService.configInvalidatorsPatched")
      : "__baseServiceConfigInvalidatorsPatched__";

  function getChromeStorage() {
    if (!chrome?.storage?.local?.get) {
      throw new Error(
        "chrome.storage.local API is unavailable in this context.",
      );
    }
    return chrome.storage.local;
  }

  function notifyStorageInvalidators(area, keys) {
    const entries = area?.[STORAGE_INVALIDATORS_KEY];
    if (!entries || entries.size === 0) {
      return;
    }
    entries.forEach((entry) => {
      const shouldInvalidate =
        keys === null ||
        (Array.isArray(keys) && keys.some((key) => entry.keys.has(key)));
      if (shouldInvalidate) {
        try {
          entry.invalidate();
        } catch {
          // ignore invalidation failures
        }
      }
    });
  }

  function patchStorageArea(area) {
    if (!area || typeof area !== "object") {
      return;
    }
    if (area[STORAGE_PATCHED_KEY]) {
      return;
    }

    if (typeof area.set === "function") {
      const originalSet = area.set;
      area.set = function patchedSet(items, callback) {
        const keys =
          items && typeof items === "object" ? Object.keys(items) : [];
        const wrappedCallback =
          typeof callback === "function"
            ? (...args) => {
                try {
                  if (keys.length > 0) {
                    notifyStorageInvalidators(area, keys);
                  }
                } catch {
                  // ignore invalidation failures
                }
                callback(...args);
              }
            : undefined;
        const result =
          typeof wrappedCallback === "function"
            ? originalSet.call(this, items, wrappedCallback)
            : originalSet.call(this, items, callback);
        if (typeof wrappedCallback !== "function" && keys.length > 0) {
          notifyStorageInvalidators(area, keys);
        }
        return result;
      };
    }

    if (typeof area.clear === "function") {
      const originalClear = area.clear;
      area.clear = function patchedClear(callback) {
        const wrappedCallback =
          typeof callback === "function"
            ? (...args) => {
                try {
                  notifyStorageInvalidators(area, null);
                } catch {
                  // ignore invalidation failures
                }
                callback(...args);
              }
            : undefined;
        const result =
          typeof wrappedCallback === "function"
            ? originalClear.call(this, wrappedCallback)
            : originalClear.call(this, callback);
        if (typeof wrappedCallback !== "function") {
          notifyStorageInvalidators(area, null);
        }
        return result;
      };
    }

    area[STORAGE_PATCHED_KEY] = true;
  }

  function registerStorageInvalidator(area, keys, invalidate) {
    if (!area || typeof area !== "object" || typeof invalidate !== "function") {
      return;
    }
    const entries =
      area[STORAGE_INVALIDATORS_KEY] ||
      (area[STORAGE_INVALIDATORS_KEY] = new Set());
    entries.add({
      keys: new Set(keys),
      invalidate,
    });
    patchStorageArea(area);
  }

  function refreshDebugFlagFromStorage() {
    if (typeof chrome?.storage?.local?.get !== "function") {
      return null;
    }
    return new Promise((resolve) => {
      const handleResult = (res) => {
        try {
          setDebugLogging(res?.[DEBUG_STORAGE_KEY]);
        } catch {
          // ignore logging flag update failures
        }
        resolve(debugEnabled);
      };

      try {
        chrome.storage.local.get([DEBUG_STORAGE_KEY], (result) => {
          handleResult(result || {});
        });
      } catch {
        handleResult({});
      }
    });
  }

  function setDebugLogging(value) {
    debugEnabled = Boolean(value);
  }

  function ensureDebugSetup() {
    if (debugInitialized) {
      return;
    }
    debugInitialized = true;
    refreshDebugFlagFromStorage();
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
        if (debugEnabled) {
          console.log(prefix, ...args);
          return;
        }
        const refreshPromise = refreshDebugFlagFromStorage();
        if (refreshPromise) {
          refreshPromise
            .then((enabled) => {
              if (enabled) {
                try {
                  console.log(prefix, ...args);
                } catch {
                  // ignore logging failures
                }
              }
            })
            .catch(() => {
              // swallow refresh errors
            });
        }
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
    const areaName =
      storageArea === chrome?.storage?.sync
        ? "sync"
        : storageArea === chrome?.storage?.session
          ? "session"
          : "local";
    let cache = null;
    let pendingPromise = null;
    let listenerAttached = false;
    const invalidateCache = () => {
      cache = null;
      pendingPromise = null;
    };

    registerStorageInvalidator(area, uniqueKeys, invalidateCache);

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

    function attachStorageListener() {
      if (listenerAttached) return;
      if (typeof chrome?.storage?.onChanged?.addListener !== "function") {
        return;
      }
      chrome.storage.onChanged.addListener((changes, changedArea) => {
        if ((changedArea || "local") !== areaName) return;
        const relevant = uniqueKeys.some((key) => hasOwn(changes, key));
        if (relevant) {
          invalidateCache();
        }
      });
      listenerAttached = true;
    }

    attachStorageListener();

    async function loadConfig() {
      attachStorageListener();
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
    finalInstruction: defaultFinalInstruction = "",
    requirePromptOrSource = false,
    missingPromptOrSourceMessage = "Prompt or source text is required.",
    missingPromptMessage = "System prompt is required.",
    userRole = "user",
    systemRole = "system",
    rulesLabel = "项目规则",
    termsLabel = "术语",
    sourceLabel = "当前句段（需要翻译）",
    contextLabel = "以下是用于参考的前文（用于理解语境和确定术语，不需要翻译）：",
    instructionLabel = DEFAULT_INSTRUCTION_LABEL,
  } = {}) {
    return function buildMessages({
      prompt,
      rules,
      terms,
      sourceText,
      contextText,
      finalInstruction: runtimeFinalInstruction,
    } = {}) {
      const systemContent = typeof prompt === "string" ? prompt.trim() : "";
      const trimmedRules = typeof rules === "string" ? rules.trim() : "";
      const trimmedSource =
        typeof sourceText === "string" ? sourceText.trim() : "";
      const trimmedContext =
        typeof contextText === "string" ? contextText.trim() : "";

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
      if (trimmedContext) {
        userParts.push(`${contextLabel}:\n${trimmedContext}`);
      }

      if (needsSourceText && trimmedSource) {
        userParts.push(`${sourceLabel}:\n${trimmedSource}`);
      }

      const instructionSource =
        typeof runtimeFinalInstruction === "string"
          ? runtimeFinalInstruction
          : defaultFinalInstruction;
      const trimmedInstruction =
        typeof instructionSource === "string" ? instructionSource.trim() : "";
      if (trimmedInstruction) {
        const instructionContent =
          typeof instructionLabel === "string" && instructionLabel.trim()
            ? `${instructionLabel}:\n${trimmedInstruction}`
            : trimmedInstruction;
        userParts.push(instructionContent);
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
