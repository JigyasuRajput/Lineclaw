class ManagerService {
  constructor(options = {}) {
    this.generator = options.generator;
  }

  async draftSentences(input) {
    const normalized = {
      audience_tag: String(input.audience_tag || "general"),
      purpose: String(input.purpose || "information update"),
      tone: String(input.tone || "professional"),
      language: String(input.language || "ja"),
    };

    const candidates = await this.generator.draftManagerSentences(normalized);
    const unique = [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];

    while (unique.length < 3) {
      unique.push(`${normalized.purpose} update (${unique.length + 1})`);
    }

    return {
      candidates: unique.slice(0, 3),
    };
  }
}

module.exports = {
  ManagerService,
};
