// content/content.js
(async () => {
  "use strict";

  const { toast } = await import(chrome.runtime.getURL("utils/toast.js"));

  // ---------- 常量 ----------
  const CONTAINER_SELECTOR =
    "#searchResultsRow > td > div > div > div.vocabulary.col-md-3";
  const WRAP_CLASS = "TransAsst-wrap";
  const BTN_COPY_CLASS = "TransAsst-copy";
  const BTN_PROVIDER_CLASS = "TransAsst-provider";
  const PROVIDERS = [
    {
      id: "deepseek",
      label: "DeepSeek",
      icon: chrome.runtime.getURL("assets/icons/deepseek.svg"),
    },
    {
      id: "deepl",
      label: "DeepL",
      icon: chrome.runtime.getURL("assets/icons/deepl.svg"),
    },
    {
      id: "google",
      label: "Google",
      icon: chrome.runtime.getURL("assets/icons/google.svg"),
    },
    {
      id: "openai",
      label: "OpenAI",
      icon: chrome.runtime.getURL("assets/icons/openai.svg"),
    },
  ];
  const PROVIDER_KEYS = PROVIDERS.map((p) => `${p.id}_apiKey`);
  const ICON_COPY = chrome.runtime.getURL("assets/icons/copy.svg");
  const BASE_BG = "rgb(216 237 251)";
  const HOVER_BG = "rgb(184 219 245)";
  const DEBUG_STORAGE_KEY = "debug";

  let debugEnabled = false;
  let enabledProviders = new Set();

  // ---------- 工具 ----------
  function log(...args) {
    try {
      if (!debugEnabled) return;
      console.log("[eLunaAsst]", ...args);
    } catch (_err) {
      // ignore logging failures
    }
  }

  function setDebugLogging(value) {
    debugEnabled = Boolean(value);
  }

  async function initDebugLogging() {
    if (!chrome?.storage?.local?.get) return;
    await new Promise((resolve) => {
      chrome.storage.local.get([DEBUG_STORAGE_KEY], (res) => {
        setDebugLogging(res?.[DEBUG_STORAGE_KEY]);
        resolve();
      });
    });
    if (typeof chrome.storage?.onChanged?.addListener === "function") {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (!Object.prototype.hasOwnProperty.call(changes, DEBUG_STORAGE_KEY))
          return;
        setDebugLogging(changes[DEBUG_STORAGE_KEY].newValue);
      });
    }
  }

  // ---------- DOM 操作 ----------
  function getActiveRow() {
    return document.querySelector("tr.activeSegment");
  }

  function getSourceText(row) {
    const el = row?.querySelector(
      "td.original > span.content, td.original .content",
    );
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function getSearchResults() {
    return document.querySelector("#searchResultsRow");
  }

  function extractPairsFromRow(searchResultsRow) {
    const pairs = [];
    if (!searchResultsRow) return pairs;
    const vocab = searchResultsRow.querySelector("div.vocabulary.col-md-3");
    if (!vocab) return pairs;

    const liElements = vocab.querySelectorAll("li");
    for (const li of liElements) {
      const divs = Array.from(li.children).filter((n) => n.tagName === "DIV");
      if (!divs.length) continue;
      const anchor = divs[0].querySelector("a");
      const termSource = (anchor?.textContent || divs[0].textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!termSource) continue;
      let found = false;
      for (let i = 1; i < divs.length; i++) {
        const zhSpans = divs[i].querySelectorAll('.termField[lang="zh"]');
        for (const span of zhSpans) {
          const zh = (span.textContent || "").replace(/\s+/g, " ").trim();
          if (zh) {
            pairs.push({ source: termSource, target: zh });
            found = true;
          }
        }
      }
      if (!found) pairs.push({ source: termSource, target: "" });
    }
    log("Extracted term pairs", pairs.length);
    return pairs;
  }

  function writeTranslation(row, zh) {
    const td =
      row?.querySelector("td.translation.chinese") ||
      row?.querySelector("td.translation");
    if (!td) return false;
    const label = "";
    const editable = td.querySelector('div.textarea[contenteditable="true"]');
    const appendTranslation = (target) => {
      const has = (target.textContent || "").trim().length > 0;
      target.textContent +=
        (has ? (target === editable ? "\n\n" : " ") : "") + label + zh;
    };
    if (editable) {
      appendTranslation(editable);
      log("Wrote translation into editable area");
      return true;
    }
    const span =
      td.querySelector('span.content[lang="zh"]') ||
      td.querySelector("span.content");
    if (span) {
      appendTranslation(span);
      log("Wrote translation into span");
      return true;
    }
    log("Failed to find translation target element");
    return false;
  }

  // ---------- 按钮 ----------
  function providerClass(id) {
    return `${BTN_PROVIDER_CLASS}-${id}`;
  }

  function styleBaseButton(btn) {
    if (btn.dataset.styled === "1") return;
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      padding: "0 10px",
      height: "30px",
      border: "0",
      borderRadius: "18px",
      background: BASE_BG,
      color: "rgb(86 181 237)",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
      transition: "background 0.2s ease",
    });
    btn.onmouseenter = () => (btn.style.background = HOVER_BG);
    btn.onmouseleave = () => (btn.style.background = BASE_BG);
    btn.dataset.styled = "1";
  }

  function ensureWrap(container) {
    let wrap = container.querySelector("." + WRAP_CLASS);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = WRAP_CLASS;
      Object.assign(wrap.style, {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "6px",
        marginBottom: "10px",
      });
      container.insertBefore(wrap, container.firstChild);
      log("Created button wrapper");
    }
    return wrap;
  }

  function addButtons(container) {
    if (!container) return;
    const wrap = ensureWrap(container);
    ensureProviderButtons(wrap);
    ensureCopyButton(wrap);
  }

  function ensureProviderButtons(wrap) {
    for (const provider of PROVIDERS) {
      const cls = providerClass(provider.id);
      let btn = wrap.querySelector("." + cls);
      if (!enabledProviders.has(provider.id)) {
        if (btn) {
          btn.remove();
          log(`Removed button for ${provider.id} (missing API key)`);
        }
        continue;
      }
      if (!btn) {
        btn = document.createElement("button");
        btn.className = `${BTN_PROVIDER_CLASS} ${cls}`;
        btn.type = "button";
        btn.title = provider.label;
        // btn.innerHTML = `
        //   <img src="${provider.icon}" alt="${provider.label}" style="width:16px;height:16px" />
        //   <span>${provider.label}</span>
        // `;
        btn.innerHTML = `
          <img src="${provider.icon}" alt="${provider.label}" style="width:16px;height:16px" />
        `;
        styleBaseButton(btn);
        btn.addEventListener("click", () => triggerTranslation(provider));
        log(`Added button for ${provider.id}`);
        wrap.appendChild(btn);
        continue;
      }
      styleBaseButton(btn);
    }
  }

  function ensureCopyButton(wrap) {
    let cBtn = wrap.querySelector("." + BTN_COPY_CLASS);
    // const markup = `
    //   <img src="${ICON_COPY}" alt="" aria-hidden="true" style="width:16px;height:16px" />
    //   <span>Copy</span>
    // `;
    const markup = `
      <img src="${ICON_COPY}" alt="" aria-hidden="true" style="width:16px;height:16px" />
    `;
    if (!cBtn) {
      cBtn = document.createElement("button");
      cBtn.className = BTN_COPY_CLASS;
      cBtn.type = "button";
      cBtn.innerHTML = markup;
      styleBaseButton(cBtn);
      cBtn.onclick = async () => {
        const row = getActiveRow();
        if (!row) return toast("未找到激活句段", false);
        const source = getSourceText(row);
        if (!source) return toast("原文为空", false);
        const searchResultsRow = getSearchResults();
        const pairs = extractPairsFromRow(searchResultsRow);
        let text = `原文：${source}\n\n术语：\n`;
        text += pairs.length
          ? pairs.map((p) => `${p.source} ${p.target}`).join("\n")
          : "（无术语）";
        await navigator.clipboard.writeText(text);
        toast("已复制原文和术语");
        log("Copied text & terms");
      };
      wrap.appendChild(cBtn);
      log("Copy button added");
    } else {
      if (!cBtn.querySelector("img")) {
        cBtn.innerHTML = markup;
      }
      styleBaseButton(cBtn);
    }
  }

  function triggerTranslation(provider) {
    const activeRow = getActiveRow();
    if (!activeRow) return toast("未找到激活句段", false);
    const source = getSourceText(activeRow);
    if (!source) return toast("原文为空", false);
    const searchResultsRow = getSearchResults();
    const pairs = extractPairsFromRow(searchResultsRow);
    const removeToast = toast(`使用 ${provider.label} 翻译中…`, true, {
      persist: true,
    });
    log("Requesting translation:", {
      provider: provider.id,
      len: source.length,
      terms: pairs.length,
    });

    chrome.runtime.sendMessage(
      {
        action: "translate",
        provider: provider.id,
        text: source,
        terms: pairs,
      },
      (res) => {
        removeToast?.();
        if (chrome.runtime.lastError) {
          toast("通信错误", false);
          return log("Runtime error:", chrome.runtime.lastError);
        }
        const zh = res?.translation || "";
        if (zh) {
          writeTranslation(activeRow, zh);
          toast("已写入译文");
        } else {
          toast("翻译失败", false);
        }
      },
    );
  }

  function refreshProviderAvailability() {
    return new Promise((resolve) => {
      chrome.storage.local.get(PROVIDER_KEYS, (res) => {
        enabledProviders = new Set(
          PROVIDERS.filter((p) => {
            const key = `${p.id}_apiKey`;
            const val = res?.[key];
            return typeof val === "string" && val.trim().length > 0;
          }).map((p) => p.id),
        );
        log("Enabled providers:", Array.from(enabledProviders));
        resolve();
      });
    });
  }

  let scanScheduled = false;
  let lastNoProviderLog = 0;

  function runScan() {
    const wasObserving = stopObserving();
    if (!enabledProviders.size) {
      const now = Date.now();
      if (now - lastNoProviderLog > 5000) {
        log("No providers enabled, skipping button injection");
        lastNoProviderLog = now;
      }
    }
    const containers = document.querySelectorAll(CONTAINER_SELECTOR);
    log("Scanning containers", containers.length);
    containers.forEach(addButtons);
    if (wasObserving) {
      startObserving();
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      runScan();
    });
  }

  let mutationObserver;
  let observerActive = false;

  function startObserving() {
    if (!mutationObserver) {
      mutationObserver = new MutationObserver(() => scheduleScan());
    }
    if (!observerActive) {
      mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      observerActive = true;
    }
  }

  function stopObserving() {
    if (mutationObserver && observerActive) {
      mutationObserver.disconnect();
      observerActive = false;
      return true;
    }
    return false;
  }

  function watchStorage() {
    if (!chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const affected = PROVIDERS.some((p) =>
        Object.prototype.hasOwnProperty.call(changes, `${p.id}_apiKey`),
      );
      if (!affected) return;
      refreshProviderAvailability().then(() => scheduleScan());
    });
  }

  await initDebugLogging();
  await refreshProviderAvailability();
  scheduleScan();
  startObserving();
  watchStorage();
})();
