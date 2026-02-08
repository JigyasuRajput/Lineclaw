const VALID_INTENTS = new Set([
  "faq",
  "opportunity_match",
  "needs_clarification",
  "sensitive",
  "unknown",
]);

const SENSITIVE_KEYWORDS = [
  "legal",
  "lawyer",
  "contract dispute",
  "payment issue",
  "lawsuit",
  "harassment",
  "abuse",
  "違法",
  "訴訟",
  "弁護士",
  "契約トラブル",
  "支払いトラブル",
  "ハラスメント",
];

const OPPORTUNITY_KEYWORDS = [
  "job",
  "audition",
  "school",
  "casting",
  "enrollment",
  "work",
  "仕事",
  "求人",
  "オーディション",
  "学校",
  "スクール",
  "出演",
  "案件",
];

const QUESTION_KEYWORDS = [
  "how",
  "when",
  "where",
  "can i",
  "could",
  "what",
  "help",
  "どう",
  "いつ",
  "どこ",
  "できますか",
  "教えて",
  "可能",
  "ですか",
];

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function clampConfidence(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 1) {
    return 1;
  }
  return parsed;
}

function heuristicClassify(messageText) {
  const text = String(messageText || "").trim().toLowerCase();

  if (!text) {
    return {
      intent: "unknown",
      confidence: 0.2,
      is_sensitive: false,
      reason: "Empty message",
    };
  }

  if (includesAny(text, SENSITIVE_KEYWORDS)) {
    return {
      intent: "sensitive",
      confidence: 0.2,
      is_sensitive: true,
      reason: "Sensitive keyword detected",
    };
  }

  if (includesAny(text, OPPORTUNITY_KEYWORDS)) {
    return {
      intent: "opportunity_match",
      confidence: 0.78,
      is_sensitive: false,
      reason: "Opportunity keyword matched",
    };
  }

  const hasQuestionMark = text.includes("?") || text.includes("？");
  if (hasQuestionMark || includesAny(text, QUESTION_KEYWORDS)) {
    return {
      intent: "faq",
      confidence: 0.62,
      is_sensitive: false,
      reason: "Question-like inquiry",
    };
  }

  if (text.length < 8) {
    return {
      intent: "unknown",
      confidence: 0.3,
      is_sensitive: false,
      reason: "Message too short for intent certainty",
    };
  }

  return {
    intent: "needs_clarification",
    confidence: 0.5,
    is_sensitive: false,
    reason: "General intent requires clarification",
  };
}

class InquiryClassifier {
  constructor(options = {}) {
    this.openaiClient = options.openaiClient;
    this.disableExternalAI = Boolean(options.disableExternalAI);
  }

  async classify(input) {
    if (!this.disableExternalAI && this.openaiClient && this.openaiClient.isConfigured()) {
      try {
        const llmResult = await this.openaiClient.chatJson({
          systemPrompt:
            "Classify LINE talent-management inquiries. Return JSON with intent, confidence (0-1), is_sensitive (bool), reason. intent must be one of faq, opportunity_match, needs_clarification, sensitive, unknown.",
          userPrompt: JSON.stringify({
            message: input.message,
            profile: input.profile || null,
            recent_context: input.recentContext || [],
          }),
          temperature: 0,
          maxTokens: 220,
        });

        if (llmResult && VALID_INTENTS.has(llmResult.intent)) {
          return {
            intent: llmResult.intent,
            confidence: clampConfidence(llmResult.confidence, 0.5),
            is_sensitive: Boolean(llmResult.is_sensitive) || llmResult.intent === "sensitive",
            reason: String(llmResult.reason || "LLM classification"),
          };
        }
      } catch (error) {
        return {
          ...heuristicClassify(input.message),
          reason: `Fallback after LLM error: ${error.message}`,
        };
      }
    }

    return heuristicClassify(input.message);
  }
}

module.exports = {
  InquiryClassifier,
  heuristicClassify,
};
