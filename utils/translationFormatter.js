
export function normalizeTranslation(input = '') {
  const text = String(input);
  return replaceEnglishQuotes(replaceHalfWidthParentheses(text));
}

export function replaceHalfWidthParentheses(input = '') {
  const text = String(input);
  return text.replace(/[()]/g, (char) => (char === '(' ? '（' : '）'));
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
