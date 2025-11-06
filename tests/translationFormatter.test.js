import "../utils/translationFormatter.js";

const {
  normalizeTranslation,
  replaceFullWidthParentheses,
  replaceEnglishQuotes,
} = globalThis.translationFormatter;

describe("translation formatter utilities", () => {
  test("replaceFullWidthParentheses converts parentheses", () => {
    expect(replaceFullWidthParentheses("（测试）")).toBe("(测试)");
  });

  test("replaceEnglishQuotes alternates open and close quotes", () => {
    expect(replaceEnglishQuotes('"你好" she said "再见"')).toBe(
      "“你好” she said “再见”",
    );
  });

  test("normalizeTranslation applies both replacements", () => {
    expect(normalizeTranslation('"test （内容）"')).toBe("“test (内容)”");
  });
});
