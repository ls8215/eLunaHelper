
export function normalizeTranslation(input = '') {
  const text = String(input);
  return replaceEnglishQuotes(replaceFullWidthParentheses(text));
}

export function replaceFullWidthParentheses(input = '') {
  const text = String(input);
  return text.replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'));
}

export function replaceEnglishQuotes(input = '') {
  const text = String(input);
  let isOpening = true;

  return text.replace(/"/g, () => {
    const replacement = isOpening ? '“' : '”';
    isOpening = !isOpening;
    return replacement;
  });
}
