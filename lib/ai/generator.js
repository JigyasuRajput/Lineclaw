const { detectLanguage } = require("../utils/language");

function firstName(profile) {
  if (!profile || !profile.display_name) {
    return "there";
  }
  return profile.display_name;
}

function toLanguage(language) {
  return language === "ja" ? "ja" : "en";
}

function fallbackAnswer(input) {
  const language = toLanguage(input.language);
  const lead = input.matches && input.matches[0];
  const name = firstName(input.profile);

  if (!lead) {
    if (language === "ja") {
      return `${name}さん、条件を確認して最適な案件を探します。希望エリア・ジャンル・時期を教えてください。`;
    }
    return `Hi ${name}, I can narrow this down for you. Please share your preferred location, genre, and timing.`;
  }

  if (language === "ja") {
    const locationText = lead.location ? ` / エリア: ${lead.location}` : "";
    const deadlineText = lead.deadline_iso ? ` / 締切: ${lead.deadline_iso}` : "";
    const urlText = lead.url ? ` / 詳細: ${lead.url}` : "";
    return `${name}さん向けの候補です: ${lead.title}${locationText}${deadlineText}${urlText}`;
  }

  const locationText = lead.location ? ` | Location: ${lead.location}` : "";
  const deadlineText = lead.deadline_iso ? ` | Deadline: ${lead.deadline_iso}` : "";
  const urlText = lead.url ? ` | Details: ${lead.url}` : "";
  return `Hi ${name}, this could match your profile: ${lead.title}${locationText}${deadlineText}${urlText}`;
}

function fallbackClarifyingQuestion(language) {
  if (language === "ja") {
    return "詳しく確認したいので、希望する仕事の種類・場所・開始時期を教えてください。";
  }
  return "To help accurately, could you share preferred job type, location, and start timing?";
}

function fallbackEscalation(language) {
  if (language === "ja") {
    return "確認が必要な内容のため、担当マネージャーに引き継ぎます。追ってご連絡します。";
  }
  return "This needs manager review, so I have escalated it. You will receive a follow-up soon.";
}

function fallbackDrafts(input) {
  const language = toLanguage(input.language);
  const tag = input.audience_tag || "talent";
  const purpose = input.purpose || "information update";
  const tone = input.tone || "professional";

  if (language === "ja") {
    return [
      `${tag}向けのお知らせです。${purpose}について、最新情報をご案内します。`,
      `${tone === "friendly" ? "こんにちは" : "ご連絡いたします"}。${purpose}の候補を整理したのでご確認ください。`,
      `${purpose}に関するご提案です。条件に合う内容を優先して共有します。`,
    ];
  }

  return [
    `Quick update for ${tag}: here is the latest on ${purpose}.`,
    `${tone === "friendly" ? "Hi" : "Hello"}, I shortlisted options for ${purpose} that may fit your profile.`,
    `Sharing a focused recommendation set for ${purpose}; priority options are listed first.`,
  ];
}

class ResponseGenerator {
  constructor(options = {}) {
    this.openaiClient = options.openaiClient;
    this.disableExternalAI = Boolean(options.disableExternalAI);
  }

  async generateAnswer(input) {
    const language = detectLanguage(input.userText, input.language);

    if (!this.disableExternalAI && this.openaiClient && this.openaiClient.isConfigured()) {
      try {
        const llmResult = await this.openaiClient.chatJson({
          systemPrompt:
            "Write concise LINE replies for talent management. Be factual, avoid speculation, and stay in the user's language (ja or en). Return JSON: {reply:string}.",
          userPrompt: JSON.stringify({
            language,
            user_message: input.userText,
            profile: input.profile || null,
            intent: input.intent,
            knowledge_matches: input.matches || [],
          }),
          temperature: 0.4,
          maxTokens: 320,
        });

        if (llmResult && llmResult.reply) {
          return String(llmResult.reply).trim();
        }
      } catch (error) {
        return fallbackAnswer({ ...input, language });
      }
    }

    return fallbackAnswer({ ...input, language });
  }

  generateClarifyingQuestion(input) {
    const language = detectLanguage(input.userText, input.language);
    return fallbackClarifyingQuestion(language);
  }

  generateEscalationNotice(input) {
    const language = detectLanguage(input.userText, input.language);
    return fallbackEscalation(language);
  }

  async draftManagerSentences(input) {
    const language = toLanguage(input.language);

    if (!this.disableExternalAI && this.openaiClient && this.openaiClient.isConfigured()) {
      try {
        const llmResult = await this.openaiClient.chatJson({
          systemPrompt:
            "Create exactly 3 distinct LINE message drafts for manager outreach. Return JSON: {candidates:string[]}.",
          userPrompt: JSON.stringify({
            audience_tag: input.audience_tag,
            purpose: input.purpose,
            tone: input.tone,
            language,
          }),
          temperature: 0.7,
          maxTokens: 380,
        });

        if (llmResult && Array.isArray(llmResult.candidates)) {
          const trimmed = llmResult.candidates
            .map((candidate) => String(candidate || "").trim())
            .filter(Boolean);
          const unique = [...new Set(trimmed)];
          if (unique.length >= 3) {
            return unique.slice(0, 3);
          }
        }
      } catch (error) {
        return fallbackDrafts(input).slice(0, 3);
      }
    }

    return fallbackDrafts({ ...input, language }).slice(0, 3);
  }
}

module.exports = {
  ResponseGenerator,
};
