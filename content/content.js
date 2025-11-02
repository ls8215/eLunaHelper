console.log("[eLunaAsst] content script loaded");

// 向后台发送一条测试消息
chrome.runtime.sendMessage(
  { type: "PING", text: "你好，我是 content script！" },
  (res) => {
    alert("后台回复：" + res.reply);
    console.log("[content] 收到后台回复：", res);
  }
);