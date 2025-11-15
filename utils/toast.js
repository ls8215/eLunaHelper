export function toast(message, ok = true, options = {}) {
  try {
    const t = document.createElement("div");
    t.textContent = message;
    const normalizedOptions =
      typeof options === "number" ? { duration: options } : options || {};
    const persist =
      Object.prototype.hasOwnProperty.call(normalizedOptions, "persist") &&
      normalizedOptions.persist != null
        ? Boolean(normalizedOptions.persist)
        : !ok;
    const duration = Number.isFinite(normalizedOptions.duration)
      ? normalizedOptions.duration
      : 2000;
    const closeOnClick =
      Object.prototype.hasOwnProperty.call(normalizedOptions, "closeOnClick") &&
      normalizedOptions.closeOnClick != null
        ? Boolean(normalizedOptions.closeOnClick)
        : !ok;
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
      cursor: closeOnClick ? "pointer" : "default",
    });
    document.body.appendChild(t);
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      if (t.parentNode) {
        t.remove();
      }
    };
    if (closeOnClick) {
      t.title = "点击关闭";
      t.addEventListener("click", remove);
    }
    if (!persist) {
      setTimeout(remove, Math.max(0, duration));
    }
    return remove;
  } catch {
    // Ignore toast rendering errors (e.g. document unavailable)
  }
}
