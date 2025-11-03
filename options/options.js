document.addEventListener("DOMContentLoaded", async () => {
  const { toast } = await import(chrome.runtime.getURL("utils/toast.js"));

  let debugEnabled = false;

  function log(message, ...details) {
    if (!debugEnabled) return;
    console.log(`[Options] ${message}`, ...details);
  }

  function updateDebugState(value) {
    debugEnabled = Boolean(value);
    if (debugToggle) {
      debugToggle.checked = debugEnabled;
    }
  }

  const sections = Array.from(document.querySelectorAll(".content-section"));
  const allButtons = document.querySelectorAll(".list-group-item");
  const generalSection = document.getElementById("section-general");
  const servicesSection = document.getElementById("section-services");
  const debugToggle = document.getElementById("debugToggle");
  const serviceTitle = document.getElementById("service-title");
  const modelField = document.getElementById("modelField");
  const modelInput = document.getElementById("modelInput");
  const modelSelect = document.getElementById("modelSelect");
  const promptField = document.getElementById("promptField");
  const promptInput = document.getElementById("promptInput");
  const rulesField = document.getElementById("rulesField");
  const rulesInput = document.getElementById("rulesInput");
  const apiTypeField = document.getElementById("apiTypeField");
  const apiTypeSelect = document.getElementById("apiTypeSelect");
  const apiBaseField = document.getElementById("apiBaseField");
  const apiBaseInput = document.getElementById("apiBaseInput");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const tempField = document.getElementById("temperatureField");
  const tempInput = document.getElementById("tempInput");

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

  const serviceConfig = {
    deepseek: {
      useSelect: true,
      showModelField: true,
      storeModel: true,
      showTemperature: true,
      storeTemp: true,
      selectOptions: [
        { value: "deepseek-chat", label: "deepseek-chat" },
        { value: "deepseek-reasoner", label: "deepseek-reasoner" },
      ],
      selectDefault: "deepseek-chat",
      showPrompt: true,
      showRules: true,
      showApiType: false,
      apiTypeOptions: [],
      apiTypeDefault: "",
      showApiBase: false,
      apiBaseDefault: "",
    },
    deepl: {
      useSelect: false,
      showModelField: false,
      storeModel: false,
      showTemperature: false,
      storeTemp: false,
      selectOptions: [],
      selectDefault: "",
      showPrompt: false,
      showRules: false,
      showApiType: true,
      apiTypeOptions: [
        { value: "free", label: "DeepL API Free" },
        { value: "pro", label: "DeepL API Pro" },
      ],
      apiTypeDefault: "free",
      showApiBase: false,
      apiBaseDefault: "",
    },
    google: {
      useSelect: false,
      showModelField: false,
      storeModel: false,
      showTemperature: false,
      storeTemp: false,
      selectOptions: [],
      selectDefault: "",
      showPrompt: false,
      showRules: false,
      showApiType: false,
      apiTypeOptions: [],
      apiTypeDefault: "",
      showApiBase: false,
      apiBaseDefault: "",
    },
    openai: {
      useSelect: true,
      showModelField: true,
      storeModel: true,
      showTemperature: true,
      storeTemp: true,
      selectOptions: [
        { value: "gpt-5", label: "gpt-5" },
        { value: "gpt-5-mimi", label: "gpt-5-mimi" },
        { value: "gpt-5-nano", label: "gpt-5-nano" },
        { value: "gpt-4.1", label: "gpt-4.1" },
        { value: "gpt-4o", label: "gpt-4o" },
        { value: "gpt-4", label: "gpt-4" },
        { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
      ],
      selectDefault: "gpt-4o",
      showPrompt: true,
      showRules: true,
      showApiType: false,
      apiTypeOptions: [],
      apiTypeDefault: "",
      showApiBase: true,
      apiBaseDefault: "https://api.openai.com",
    },
  };

  function showSection(target) {
    sections.forEach((sec) => sec.classList.add("d-none"));
    if (target) {
      target.classList.remove("d-none");
    }
  }

  // 绑定左侧导航点击事件
  allButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // 取消所有按钮的 active 状态
      allButtons.forEach((b) => b.classList.remove("active"));
      // 给当前按钮添加 active
      btn.classList.add("active");

      if (btn.dataset.section === "general") {
        showSection(generalSection);
        log("General tab selected");
        return;
      }

      // 识别是哪项服务
      const service = btn.dataset.service;
      if (!service) return;
      log("Service tab selected", service);

      // 更新右栏标题与图标
      serviceTitle.innerHTML = `
        <img id="service-icon" src="${iconMap[service]}" alt="${nameMap[service]} Icon" class="icon me-2" />
        ${nameMap[service]}
      `;

      // 隐藏其他 section，仅显示服务设置区
      showSection(servicesSection);

      // 加载对应服务的配置
      loadServiceSettings(service);
    });
  });

  showSection(generalSection);

  if (chrome?.storage?.local) {
    chrome.storage.local.get(["debug"], (res) => {
      updateDebugState(res?.debug);
      log("Debug state loaded", res?.debug);
    });

    if (typeof chrome.storage.onChanged?.addListener === "function") {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, "debug")) return;
        updateDebugState(changes.debug.newValue);
        log("Debug state updated via storage listener", changes.debug.newValue);
      });
    }
  }

  if (debugToggle) {
    debugToggle.addEventListener("change", () => {
      const enabled = debugToggle.checked;
      updateDebugState(enabled);
      if (chrome?.storage?.local?.set) {
        chrome.storage.local.set({ debug: enabled }, () => {
          log("Debug mode toggled", enabled);
        });
      }
    });
  }

  // 加载当前选中的（默认 deepseek）配置
  loadServiceSettings("deepseek");

  // 保存/加载逻辑
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");

  function getServiceConfig(service) {
    return (
      serviceConfig[service] || {
        useSelect: false,
        showModelField: true,
        storeModel: true,
        showTemperature: true,
        storeTemp: true,
        selectOptions: [],
        selectDefault: "",
        showPrompt: false,
        showRules: false,
        showApiType: false,
        apiTypeOptions: [],
        apiTypeDefault: "",
        showApiBase: false,
        apiBaseDefault: "",
      }
    );
  }

  function configureServiceFields(service) {
    const config = getServiceConfig(service);

    if (config.useSelect) {
      const optionsMarkup = config.selectOptions
        .map(({ value, label }) => `<option value="${value}">${label}</option>`)
        .join("");
      modelSelect.innerHTML = optionsMarkup;
      modelSelect.classList.remove("d-none");
      modelInput.classList.add("d-none");
    } else {
      modelInput.classList.remove("d-none");
      modelSelect.classList.add("d-none");
    }

    modelField.classList.toggle("d-none", !config.showModelField);

    promptField.classList.toggle("d-none", !config.showPrompt);
    rulesField.classList.toggle("d-none", !config.showRules);
    tempField.classList.toggle("d-none", !config.showTemperature);

    if (config.showApiType) {
      const apiOptionsMarkup = config.apiTypeOptions
        .map(({ value, label }) => `<option value="${value}">${label}</option>`)
        .join("");
      apiTypeSelect.innerHTML = apiOptionsMarkup;
      apiTypeField.classList.remove("d-none");
    } else {
      apiTypeField.classList.add("d-none");
    }

    apiBaseField.classList.toggle("d-none", !config.showApiBase);

    return config;
  }

  async function loadServiceSettings(service) {
    log("Loading service settings", service);
    const config = configureServiceFields(service);
    const keys = [`${service}_apiKey`];
    if (config.storeModel) {
      keys.push(`${service}_model`);
    }
    if (config.showPrompt) {
      keys.push(`${service}_prompt`, `${service}_rules`);
    }
    if (config.showApiType) {
      keys.push(`${service}_apiType`);
    }
    if (config.showApiBase) {
      keys.push(`${service}_apiBaseUrl`);
    }
    if (config.storeTemp) {
      keys.push(`${service}_temp`);
    }

    chrome.storage.local.get(keys, (res) => {
      log("Storage values retrieved", { service, keys, values: res });
      apiKeyInput.value = res[`${service}_apiKey`] || "";
      if (config.storeModel) {
        const savedModel = res[`${service}_model`];
        if (config.useSelect) {
          const targetModel = savedModel || config.selectDefault;
          if ([...modelSelect.options].some((opt) => opt.value === targetModel)) {
            modelSelect.value = targetModel;
          } else {
            modelSelect.value = config.selectDefault;
          }
        } else {
          modelInput.value = savedModel || "";
        }
      }

      if (config.showPrompt) {
        promptInput.value = res[`${service}_prompt`] || "";
        rulesInput.value = res[`${service}_rules`] || "";
      }

      if (config.showApiType) {
        const savedApiType = res[`${service}_apiType`] || config.apiTypeDefault;
        if ([...apiTypeSelect.options].some((opt) => opt.value === savedApiType)) {
          apiTypeSelect.value = savedApiType;
        } else {
          apiTypeSelect.value = config.apiTypeDefault;
        }
      }

      if (config.storeTemp) {
        tempInput.value = res[`${service}_temp`] ?? 1;
      } else {
        tempInput.value = 1;
      }

      if (config.showApiBase) {
        apiBaseInput.value = res[`${service}_apiBaseUrl`] || config.apiBaseDefault || "";
      } else {
        apiBaseInput.value = "";
      }

      log("Service settings applied", service);
    });
  }

  saveBtn.addEventListener("click", async () => {
    const activeBtn = document.querySelector(".list-group-item.active");
    const service = activeBtn ? activeBtn.dataset.service : "deepseek";
    const config = getServiceConfig(service);
    log("Saving service settings", service);

    const apiKey = apiKeyInput.value.trim();
    const payload = {
      [`${service}_apiKey`]: apiKey,
    };

    if (config.showApiBase) {
      const apiBaseUrl = apiBaseInput.value.trim() || config.apiBaseDefault || "";
      payload[`${service}_apiBaseUrl`] = apiBaseUrl;
    }

    if (config.storeTemp) {
      const baseTemp = parseFloat(tempInput.value);
      const temp = Number.isFinite(baseTemp) ? baseTemp : 1;
      payload[`${service}_temp`] = temp;
    }

    if (config.storeModel) {
      if (config.useSelect) {
        payload[`${service}_model`] = modelSelect.value;
      } else {
        payload[`${service}_model`] = modelInput.value.trim();
      }
    }

    if (config.showPrompt) {
      payload[`${service}_prompt`] = promptInput.value.trim();
      payload[`${service}_rules`] = rulesInput.value.trim();
    }

    if (config.showApiType) {
      payload[`${service}_apiType`] = apiTypeSelect.value;
    }

    await chrome.storage.local.set(payload);
    log("Service settings saved", { service, payload });
    toast(`${nameMap[service]} 设置已保存！`);
  });

  resetBtn.addEventListener("click", () => {
    const activeBtn = document.querySelector(".list-group-item.active");
    const service = activeBtn ? activeBtn.dataset.service : "deepseek";
    const config = getServiceConfig(service);
    log("Resetting service settings", service);

    apiKeyInput.value = "";
    if (config.storeTemp) {
      tempInput.value = 1;
    }

    if (config.storeModel) {
      if (config.useSelect) {
        modelSelect.value = config.selectDefault || "";
      } else {
        modelInput.value = "";
      }
    }

    if (config.showPrompt) {
      promptInput.value = "";
      rulesInput.value = "";
    }

    if (config.showApiType) {
      apiTypeSelect.value = config.apiTypeDefault || "";
    }

    if (config.showApiBase) {
      apiBaseInput.value = config.apiBaseDefault || "";
    } else {
      apiBaseInput.value = "";
    }

    log("Service settings reset to defaults", service);
  });
});
