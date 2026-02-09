const { detectLanguage } = require("../utils/language");

const CASTING_SYSTEM_PROMPT = `You are a professional casting assistant AI for Hakuhodo DY Group.

Your role:
- Answer questions about talent availability and NG conditions
- Assess scandal risks for brand safety
- Help staff find internal experts for specific talents
- Alert about contract conflicts and expirations

Response format:
- Start with status indicator (✅ Available / ⚠️ Caution / ❌ Not Available)
- List key facts in bullets
- Include risk assessment when relevant
- Recommend expert contact when applicable
- Always respond in professional Japanese

When checking talent availability, consider:
1. Current exclusive contracts
2. NG brands/categories
3. Past scandal history
4. Competitive restrictions`;

const RESPONSE_TEMPLATES = {
  talent_available: "✅ {talent}さんは起用可能です\n\n⚠️ 注意事項:\n{ng_conditions}\n\n💡 詳細は{expert}さんにご相談ください",
  talent_ng: "❌ {talent}さんは現在起用できません\n\n理由:\n{reason}\n\n✅ 代替案:\n{alternatives}",
  scandal_risk: "🔍 {talent}さんのリスク評価\n\n総合評価: {risk_level}\n過去の問題:\n{history}\n\n推奨: {recommendation}",
  contract_alert: "⚠️ 契約更新アラート\n\n{talent}さんの契約が{days}日後に期限切れ\n\n📄 詳細:\n{details}\n\n🔔 要確認事項:\n{conflicts}",
  expert_found: "🎯 {specialization}の専門チーム\n\n最適な相談相手:\n{experts}\n\n連絡先を共有しますか?",
  general_response: "{content}",
};

function formatTemplate(templateKey, data) {
  let template = RESPONSE_TEMPLATES[templateKey] || RESPONSE_TEMPLATES.general_response;
  for (const [key, value] of Object.entries(data)) {
    template = template.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
  }
  return template;
}

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
  const name = firstName(input.profile);

  if (language === "ja") {
    return `${name}さん、お問い合わせありがとうございます。詳細を確認してご回答いたします。`;
  }
  return `Hi ${name}, thank you for your inquiry. I will check the details and respond.`;
}

function fallbackClarifyingQuestion(language) {
  if (language === "ja") {
    return "詳しく確認したいので、タレント名・ブランド名・カテゴリを教えてください。";
  }
  return "To help accurately, could you share the talent name, brand, and category?";
}

function fallbackEscalation(language) {
  if (language === "ja") {
    return "確認が必要な内容のため、担当者に引き継ぎます。追ってご連絡します。";
  }
  return "This needs specialist review, so I have escalated it. You will receive a follow-up soon.";
}

function fallbackDrafts(input) {
  const language = toLanguage(input.language);
  const tag = input.audience_tag || "スタッフ";
  const purpose = input.purpose || "キャスティング案件";
  const tone = input.tone || "professional";

  if (language === "ja") {
    return [
      `${tag}向けのお知らせです。${purpose}について、最新情報をご案内します。`,
      `${tone === "friendly" ? "お疲れ様です" : "ご連絡いたします"}。${purpose}の候補を整理したのでご確認ください。`,
      `${purpose}に関するご提案です。条件に合う内容を優先して共有します。`,
    ];
  }

  return [
    `Quick update for ${tag}: here is the latest on ${purpose}.`,
    `${tone === "friendly" ? "Hi" : "Hello"}, I shortlisted options for ${purpose} that may fit requirements.`,
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
          systemPrompt: CASTING_SYSTEM_PROMPT,
          userPrompt: JSON.stringify({
            language,
            user_message: input.userText,
            profile: input.profile || null,
            intent: input.intent,
            casting_data: input.castingData || null,
            knowledge_matches: input.matches || [],
          }),
          temperature: 0.4,
          maxTokens: 500,
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
            "Create exactly 3 distinct LINE message drafts for casting team outreach. Return JSON: {candidates:string[]}.",
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
  CASTING_SYSTEM_PROMPT,
  RESPONSE_TEMPLATES,
  formatTemplate,
};
