chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "translate") {
    const { text, provider, terms } = msg;
    console.log("[background] received:", provider, text.slice(0, 50), terms.length);
    // TODO: 调用 DeepSeek API
    sendResponse({ translation: "(mock translation result)" });
  }
  return true;
});
