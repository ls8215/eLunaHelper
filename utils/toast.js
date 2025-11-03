export function toast(message, ok = true, options = {}) {
  try {
    const t = document.createElement("div");
    t.textContent = message;
    const { persist = false, duration = 2000 } =
      typeof options === "number" ? { duration: options } : options || {};
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
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      if (t.parentNode) {
        t.remove();
      }
    };
    if (!persist) {
      setTimeout(
        remove,
        Math.max(0, Number.isFinite(duration) ? duration : 2000),
      );
    }
    return remove;
  } catch {
    // Ignore toast rendering errors (e.g. document unavailable)
  }
}
