// content/content.js
(() => {
  "use strict";

  // ---------- 常量 ----------
  const CONTAINER_SELECTOR = "#searchResultsRow > td > div > div > div.vocabulary.col-md-3";
  const WRAP_CLASS = "TransAsst-wrap";
  const BTN_COPY_CLASS = "TransAsst-copy";
  const BTN_TL_CLASS = "TransAsst-translate";

  // ---------- 工具 ----------
  function toast(msg, ok = true) {
    try {
      const t = document.createElement("div");
      t.textContent = msg;
      Object.assign(t.style, {
        position: "fixed",
        zIndex: 99999,
        left: "50%",
        top: "15%",
        transform: "translate(-50%, -50%)",
        background: ok ? "#5bb9ef" : "#b02a37",
        color: "#fff",
        padding: "12px 18px",
        borderRadius: "10px",
        boxShadow: "0 4px 16px rgba(0,0,0,.25)",
        fontSize: "14px",
        maxWidth: "70vw",
        textAlign: "center",
        lineHeight: "1.4",
      });
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2000);
    } catch {}
  }

  function log(...args) {
    console.log("[eLunaAsst]", ...args);
  }

  // ---------- DOM 操作 ----------
  function getActiveRow() {
    return document.querySelector("tr.activeSegment");
  }

  function getSourceText(row) {
    const el = row?.querySelector("td.original > span.content, td.original .content");
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
      const termSource = (anchor?.textContent || divs[0].textContent || "").replace(/\s+/g, " ").trim();
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
    const td = row?.querySelector("td.translation.chinese") || row?.querySelector("td.translation");
    if (!td) return false;
    const label = "";
    const editable = td.querySelector('div.textarea[contenteditable="true"]');
    if (editable) {
      const has = (editable.textContent || "").trim().length > 0;
      editable.textContent += (has ? "\n\n" : "") + label + zh;
      log("Wrote translation into editable area");
      return true;
    }
    const span = td.querySelector('span.content[lang="zh"]') || td.querySelector("span.content");
    if (span) {
      const has = (span.textContent || "").trim().length > 0;
      span.textContent += (has ? " " : "") + label + zh;
      log("Wrote translation into span");
      return true;
    }
    log("Failed to find translation target element");
    return false;
  }

  // ---------- 按钮 ----------
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
    const baseBg = "rgb(216 237 251)";
    const hoverBg = "rgb(184 219 245)";

    const styleBtn = (btn) => {
      Object.assign(btn.style, {
        width: "70px",
        height: "26px",
        border: "0",
        borderRadius: "4px",
        background: baseBg,
        color: "rgb(86 181 237)",
        fontWeight: "700",
        fontSize: "small",
        cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
      });
    };

    // Translate button
    let tBtn = wrap.querySelector("." + BTN_TL_CLASS);
    if (!tBtn) {
      tBtn = document.createElement("button");
      tBtn.className = BTN_TL_CLASS;
      tBtn.textContent = "Translate";
      styleBtn(tBtn);
      tBtn.onmouseenter = () => (tBtn.style.background = hoverBg);
      tBtn.onmouseleave = () => (tBtn.style.background = baseBg);
      tBtn.onclick = async () => {
        const activeRow = getActiveRow();
        if (!activeRow) return toast("未找到激活句段", false);
        const source = getSourceText(activeRow);
        if (!source) return toast("原文为空", false);
        const searchResultsRow = getSearchResults();
        const pairs = extractPairsFromRow(searchResultsRow);
        toast("翻译中…");
        log("Requesting translation:", { len: source.length, terms: pairs.length });

        // 向 background.js 发送翻译请求
        chrome.runtime.sendMessage(
          { action: "translate", provider: "deepseek", text: source, terms: pairs },
          (res) => {
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
          }
        );
      };
      wrap.appendChild(tBtn);
      log("Translate button added");
    }

    // Copy button
    let cBtn = wrap.querySelector("." + BTN_COPY_CLASS);
    if (!cBtn) {
      cBtn = document.createElement("button");
      cBtn.className = BTN_COPY_CLASS;
      cBtn.textContent = "Copy";
      styleBtn(cBtn);
      cBtn.onmouseenter = () => (cBtn.style.background = hoverBg);
      cBtn.onmouseleave = () => (cBtn.style.background = baseBg);
      cBtn.onclick = async () => {
        const row = getActiveRow();
        if (!row) return toast("未找到激活句段", false);
        const source = getSourceText(row);
        if (!source) return toast("原文为空", false);
        const searchResultsRow = getSearchResults();
        const pairs = extractPairsFromRow(searchResultsRow);
        let text = `原文：${source}\n\n术语：\n`;
        text += pairs.length ? pairs.map((p) => `${p.source} ${p.target}`).join("\n") : "（无术语）";
        await navigator.clipboard.writeText(text);
        toast("已复制原文和术语");
        log("Copied text & terms");
      };
      wrap.appendChild(cBtn);
      log("Copy button added");
    }
  }

  function scan() {
    const containers = document.querySelectorAll(CONTAINER_SELECTOR);
    log("Scanning containers", containers.length);
    containers.forEach(addButtons);
  }

  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();