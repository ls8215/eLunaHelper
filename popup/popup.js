const SERVICE_DEFINITIONS = [
  {
    id: "deepl",
    name: "DeepL",
    icon: "assets/icons/deepl.svg",
    configKey: "deepl_apiKey",
    type: "usage",
    format: (data) => {
      const used = data?.character_count;
      const limit = data?.character_limit;
      if (typeof used === "number" && typeof limit === "number" && limit > 0) {
        const percentage = Math.min(100, Math.round((used / limit) * 100));
        return `Used ${used.toLocaleString()} / ${limit.toLocaleString()} (${percentage}%)`;
      }
      if (typeof used === "number") {
        return `Used ${used.toLocaleString()} characters`;
      }
      return "Usage unavailable";
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "assets/icons/deepseek.svg",
    configKey: "deepseek_apiKey",
    type: "balance",
    format: (data) => {
      const balanceInfo =
        Array.isArray(data?.balance_infos) && data.balance_infos.length > 0
          ? data.balance_infos[0]
          : null;
      const total = formatAmount(
        balanceInfo?.total_balance ?? data?.balance ?? null,
      );
      if (!total) {
        return "Balance unavailable";
      }
      const currency =
        typeof balanceInfo?.currency === "string" && balanceInfo.currency.trim()
          ? balanceInfo.currency.trim()
          : typeof data?.currency === "string"
            ? data.currency
            : "USD";

      return `Total balance ${total} ${currency}`;
    },
  },
  {
    id: "google",
    name: "Google Translate",
    icon: "assets/icons/google.svg",
    configKey: "google_apiKey",
    type: "external",
    usageUrl:
      "https://console.cloud.google.com/apis/api/translate.googleapis.com/metrics",
    hint: "Check usage in your Google Cloud dashboard",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "assets/icons/openai.svg",
    configKey: "openai_apiKey",
    type: "external",
    usageUrl: "https://platform.openai.com/usage",
    hint: "Check usage in your OpenAI dashboard",
  },
];

const serviceElements = new Map();

function runtimeAsset(path) {
  return chrome.runtime.getURL(path);
}

function formatAmount(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return trimmed;
  }

  return null;
}

function getStorageValues(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function createServiceCard(definition) {
  const card = document.createElement("article");
  card.className = "service-card";
  card.dataset.service = definition.id;

  const icon = document.createElement("img");
  icon.className = "service-card__icon";
  icon.src = runtimeAsset(definition.icon);
  icon.alt = definition.name;

  const content = document.createElement("div");
  content.className = "service-card__content";

  const title = document.createElement("h4");
  title.className = "service-card__title";
  title.textContent = definition.name;

  const meta = document.createElement("div");
  meta.className = "service-card__meta";
  if (definition.hint) {
    meta.textContent = definition.hint;
  }

  content.appendChild(title);
  content.appendChild(meta);

  const actionWrapper = document.createElement("div");
  actionWrapper.className = "service-card__action";

  const badge = document.createElement("span");
  badge.className = "service-card__badge service-card__badge--loading";
  badge.textContent = "Loading...";

  actionWrapper.appendChild(badge);

  card.appendChild(icon);
  card.appendChild(content);
  card.appendChild(actionWrapper);

  return {
    card,
    badge,
    meta,
  };
}

const BADGE_CLASS_MAP = {
  inactive: "service-card__badge--inactive",
  active: "service-card__badge--active",
  error: "service-card__badge--error",
  loading: "service-card__badge--loading",
};

function setBadgeState(badge, state, label) {
  if (!badge) return;
  badge.textContent = label;
  Object.values(BADGE_CLASS_MAP).forEach((className) => {
    badge.classList.remove(className);
  });
  const className = BADGE_CLASS_MAP[state] || BADGE_CLASS_MAP.loading;
  badge.classList.add(className);
}

function queryService(definition) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "queryService",
        service: definition.id,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!response) {
          reject(new Error("No response from service"));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (response.ok === false) {
          reject(new Error(response.error || "Service query failed"));
          return;
        }
        resolve(response.data);
      },
    );
  });
}

async function refreshServiceData(definition, elements) {
  setBadgeState(elements.badge, "loading", "Updating...");
  elements.meta.textContent = "Fetching...";
  elements.meta.className = "service-card__loading";

  try {
    const data = await queryService(definition);
    const formatted = definition.format?.(data);
    elements.meta.textContent = formatted || "Fetched successfully";
    elements.meta.className = "service-card__usage";
    setBadgeState(elements.badge, "active", "Active");
  } catch (error) {
    const message = error?.message || "Fetch failed";
    elements.meta.textContent = message;
    elements.meta.className = "service-card__meta";
    setBadgeState(elements.badge, "error", "Error");
  }
}

async function loadServiceStatus() {
  const listContainer = document.getElementById("service-list");
  listContainer.innerHTML = "";
  serviceElements.clear();

  const storageKeys = SERVICE_DEFINITIONS.map((item) => item.configKey);
  const stored = await getStorageValues(storageKeys);

  SERVICE_DEFINITIONS.forEach((definition) => {
    const elements = createServiceCard(definition);
    listContainer.appendChild(elements.card);
    serviceElements.set(definition.id, elements);

    const rawValue = stored?.[definition.configKey];
    const configured =
      typeof rawValue === "string"
        ? rawValue.trim().length > 0
        : Boolean(rawValue);

    if (!configured) {
      elements.meta.textContent = "Configure this service in Settings first";
      elements.meta.className = "service-card__meta";
      setBadgeState(elements.badge, "inactive", "Inactive");
      return;
    }

    elements.meta.textContent =
      definition.type === "external"
        ? definition.hint || "Usage available on provider dashboard"
        : "Ready";
    elements.meta.className =
      definition.type === "external"
        ? "service-card__meta"
        : "service-card__loading";

    if (definition.type === "usage" || definition.type === "balance") {
      refreshServiceData(definition, elements);
    } else {
      setBadgeState(elements.badge, "active", "Active");
    }
  });
}

function setupOptionsShortcut() {
  const button = document.getElementById("open-options");
  if (!button) return;
  button.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options/options.html"));
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupOptionsShortcut();
  loadServiceStatus();
});
