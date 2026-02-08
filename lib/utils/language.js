const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u4e00-\u9faf]/;

function normalizeLanguage(language) {
  const normalized = String(language || "").toLowerCase();
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  return "en";
}

function detectLanguage(text, preferredLanguage) {
  if (preferredLanguage) {
    return normalizeLanguage(preferredLanguage);
  }
  if (JAPANESE_CHAR_REGEX.test(String(text || ""))) {
    return "ja";
  }
  return "en";
}

function bilingualFallback() {
  return {
    en: "I can answer questions about jobs, auditions, and schools. Could you share one more detail?",
    ja: "仕事・オーディション・学校の質問に対応できます。もう1つだけ詳細を教えてください。",
  };
}

module.exports = {
  normalizeLanguage,
  detectLanguage,
  bilingualFallback,
};
