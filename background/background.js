// 初始化：监听 storage 改动
chrome.runtime.onInstalled.addListener(() => {
  console.log("[eLunaAsst] background script running");
  loadConfig();
});

// 当设置变化时重新加载配置
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    console.log("[background] 检测到设置变更:", changes);
    loadConfig();
  }
});

// 读取配置
async function loadConfig() {
  const data = await chrome.storage.sync.get(["service", "apikey"]);
  const service = data.service || "deepseek";
  const apikey = data.apikey || "(未设置)";
  console.log(`[background] 当前服务: ${service}, API key: ${apikey}`);
}

// 测试通信：仍保留之前的 PING
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING") {
    console.log("[background] 收到消息：", msg.text);
    sendResponse({ reply: "后台已收到：" + msg.text });
  }
  return true;
});