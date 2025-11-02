async function loadStatus() {
  const data = await chrome.storage.sync.get(["service", "apikey"]);
  const service = data.service || "未设置";
  const apikey = data.apikey ? "已设置" : "未设置";

  document.getElementById("current-service").textContent = service;
  document.getElementById("key-status").textContent = apikey;
}

document.getElementById("open-options").addEventListener("click", () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options/options.html"));
  }
});

document.addEventListener("DOMContentLoaded", loadStatus);