(function initTranslationFormatter(globalScope) {
  if (!globalScope) return;

  function replaceFullWidthParentheses(input = "") {
    const text = String(input);
    return text.replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
  }

  function replaceEnglishQuotes(input = "") {
    const text = String(input);
    let isOpening = true;

    return text.replace(/"/g, () => {
      const replacement = isOpening ? "“" : "”";
      isOpening = !isOpening;
      return replacement;
    });
  }

  function normalizeTranslation(input = "") {
    const text = String(input);
    return replaceEnglishQuotes(replaceFullWidthParentheses(text));
  }

  const api = {
    normalizeTranslation,
    replaceFullWidthParentheses,
    replaceEnglishQuotes,
  };

  if (!globalScope.translationFormatter) {
    globalScope.translationFormatter = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
