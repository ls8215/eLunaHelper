document.addEventListener("DOMContentLoaded", () => {
  const allButtons = document.querySelectorAll(".list-group-item");
  const serviceTitle = document.getElementById("service-title");
  const serviceIcon = document.getElementById("service-icon");

  // 图标映射表
  const iconMap = {
    deepseek: "../assets/icons/deepseek.svg",
    deepl: "../assets/icons/deepl.svg",
    google: "../assets/icons/google.svg",
    openai: "../assets/icons/openai.svg",
  };

  // 服务名称映射表
  const nameMap = {
    deepseek: "DeepSeek",
    deepl: "DeepL",
    google: "Google Translate",
    openai: "OpenAI",
  };

  // 绑定左侧导航点击事件
  allButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // 取消所有按钮的 active 状态
      allButtons.forEach((b) => b.classList.remove("active"));
      // 给当前按钮添加 active
      btn.classList.add("active");

      // 识别是哪项服务
      const service = btn.dataset.service;
      if (!service) return;

      // 更新右栏标题与图标
      serviceTitle.innerHTML = `
        <img id="service-icon" src="${iconMap[service]}" alt="${nameMap[service]} Icon" class="icon me-2" />
        ${nameMap[service]}
      `;

      // 隐藏其他 section，仅显示服务设置区
      document.querySelectorAll(".content-section").forEach((sec) => sec.classList.add("d-none"));
      document.getElementById("section-services").classList.remove("d-none");

      // 加载对应服务的配置
      loadServiceSettings(service);
    });
  });

  // 加载当前选中的（默认 deepseek）配置
  loadServiceSettings("deepseek");

  // 保存/加载逻辑
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");

  async function loadServiceSettings(service) {
    chrome.storage.local.get([`${service}_apiKey`, `${service}_model`, `${service}_temp`], (res) => {
      document.getElementById("apiKeyInput").value = res[`${service}_apiKey`] || "";
      document.getElementById("modelInput").value = res[`${service}_model`] || "";
      document.getElementById("tempInput").value = res[`${service}_temp`] || 1;
    });
  }

  saveBtn.addEventListener("click", async () => {
    const activeBtn = document.querySelector(".list-group-item.active");
    const service = activeBtn ? activeBtn.dataset.service : "deepseek";

    const apiKey = document.getElementById("apiKeyInput").value.trim();
    const model = document.getElementById("modelInput").value.trim();
    const temp = parseFloat(document.getElementById("tempInput").value) || 1;

    const payload = {
      [`${service}_apiKey`]: apiKey,
      [`${service}_model`]: model,
      [`${service}_temp`]: temp,
    };

    await chrome.storage.local.set(payload);
    alert(`${nameMap[service]} 设置已保存！`);
  });

  resetBtn.addEventListener("click", () => {
    document.getElementById("apiKeyInput").value = "";
    document.getElementById("modelInput").value = "";
    document.getElementById("tempInput").value = 1;
  });
});