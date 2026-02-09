const VALID_INTENTS = new Set([
  "talent_ng_check",
  "scandal_risk_check",
  "contract_status",
  "expert_finder",
  "conflict_check",
  "general_casting_query",
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

const TALENT_NG_KEYWORDS = [
  "使える",
  "使えますか",
  "起用",
  "キャスティング",
  "NG",
  "ng",
  "CM",
  "広告",
  "出演可能",
  "available",
  "can we use",
  "cast",
];

const SCANDAL_RISK_KEYWORDS = [
  "リスク",
  "スキャンダル",
  "炎上",
  "週刊誌",
  "問題",
  "過去",
  "評判",
  "risk",
  "scandal",
  "controversy",
  "reputation",
];

const CONTRACT_STATUS_KEYWORDS = [
  "契約",
  "状況",
  "期限",
  "更新",
  "いつまで",
  "満了",
  "contract",
  "status",
  "expir",
  "renew",
];

const EXPERT_FINDER_KEYWORDS = [
  "詳しい",
  "専門",
  "担当",
  "相談",
  "誰に聞けば",
  "韓国",
  "expert",
  "specialist",
  "who knows",
  "contact",
];

const CONFLICT_CHECK_KEYWORDS = [
  "競合",
  "抵触",
  "バッティング",
  "かぶり",
  "重複",
  "conflict",
  "overlap",
  "competing",
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

  if (includesAny(text, CONFLICT_CHECK_KEYWORDS)) {
    return {
      intent: "conflict_check",
      confidence: 0.82,
      is_sensitive: false,
      reason: "Conflict check keywords matched",
    };
  }

  if (includesAny(text, SCANDAL_RISK_KEYWORDS)) {
    return {
      intent: "scandal_risk_check",
      confidence: 0.80,
      is_sensitive: false,
      reason: "Scandal/risk keywords matched",
    };
  }

  if (includesAny(text, TALENT_NG_KEYWORDS)) {
    return {
      intent: "talent_ng_check",
      confidence: 0.85,
      is_sensitive: false,
      reason: "Talent NG/availability keywords matched",
    };
  }

  if (includesAny(text, CONTRACT_STATUS_KEYWORDS)) {
    return {
      intent: "contract_status",
      confidence: 0.78,
      is_sensitive: false,
      reason: "Contract status keywords matched",
    };
  }

  if (includesAny(text, EXPERT_FINDER_KEYWORDS)) {
    return {
      intent: "expert_finder",
      confidence: 0.75,
      is_sensitive: false,
      reason: "Expert finder keywords matched",
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
    intent: "general_casting_query",
    confidence: 0.5,
    is_sensitive: false,
    reason: "General casting inquiry",
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
            "Classify casting queries for Hakuhodo DY Group. Return JSON with intent, confidence (0-1), is_sensitive (bool), reason. intent must be one of: talent_ng_check (checking if talent can be used for a brand/category), scandal_risk_check (assessing talent risk), contract_status (contract info inquiry), expert_finder (finding internal specialist), conflict_check (competitive overlap), general_casting_query (other), sensitive (legal/harassment issues), unknown.",
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
