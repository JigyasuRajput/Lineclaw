const { getContainer } = require("../../lib/container");
const { verifyLineSignature } = require("../../lib/line/signature");
const {
  getHeader,
  getRawBody,
  parseJsonBody,
  sendJson,
  sendMethodNotAllowed,
} = require("../../lib/utils/http");

const QUICK_REPLIES = [
  { type: "action", action: { type: "message", label: "📊 ダッシュボード", text: "ダッシュボード" } },
  { type: "action", action: { type: "message", label: "⚠️ アラート", text: "アラート" } },
  { type: "action", action: { type: "message", label: "🎯 おすすめ", text: "おすすめタレント" } },
  { type: "action", action: { type: "message", label: "👥 専門家", text: "専門家一覧" } },
];

// Button command keywords
const BUTTON_COMMANDS = {
  "タレント検索": "talent_list",
  "タレント一覧": "talent_list",
  "リスクチェック": "risk_list",
  "show high risk talents": "risk_list",
  "専門家を探す": "expert_list",
  "専門家一覧": "expert_list",
  "show all experts": "expert_list",
  "ダッシュボード": "dashboard",
  "dashboard": "dashboard",
  "おすすめタレント": "recommend",
  "おすすめ": "recommend",
  "recommend": "recommend",
};

// Greeting keywords (English and Japanese)
const GREETING_KEYWORDS = [
  "hi", "hii", "hello", "hey", "hola", "yo", "sup",
  "こんにちは", "こんばんは", "おはよう", "はじめまして", "やあ", "ハロー",
  "start", "help", "menu", "始める", "ヘルプ", "メニュー"
];

const GREETING_RESPONSE = `👋 博報堂キャスティングアシスタント
   Hakuhodo Casting Assistant

このボットでできること / What this bot can do:
• 📊 ダッシュボード / Dashboard → 全体状況 / Overview
• ⚠️ アラート / Alerts → 契約期限 / Contract Expiry
• 🎯 おすすめ / Recommend → タレント推薦 / Talent Picks
• 👥 専門家 / Experts → 担当者検索 / Find Contacts

例文 / Examples:
• 「田中太郎はビールのCMに使えますか？」
• 「佐藤健太のリスクを教えてください」
• 「韓国タレントに詳しい人」
• 「おすすめタレント」

下のボタンからお試しください / Tap a button below 👇`;

function createWebhookHandler(containerProvider = getContainer) {
  return async function webhookHandler(req, res) {
    if (req.method !== "POST") {
      return sendMethodNotAllowed(res, ["POST"]);
    }

    const container = containerProvider();
    const config = container.config;

    const rawBody = await getRawBody(req);
    let body;

    try {
      body = req.body && typeof req.body === "object" ? req.body : await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, {
        error: "invalid_json",
        message: error.message,
      });
    }

    const signature = getHeader(req, "x-line-signature");
    if (config.line.channelSecret) {
      const verified = verifyLineSignature(rawBody, signature, config.line.channelSecret);
      if (!verified) {
        return sendJson(res, 401, {
          error: "invalid_signature",
          message: "LINE signature verification failed",
        });
      }
    } else if (!config.flags.allowUnsignedWebhook) {
      return sendJson(res, 503, {
        error: "configuration_incomplete",
        message: "LINE_CHANNEL_SECRET is required unless ALLOW_UNSIGNED_WEBHOOK=true",
      });
    }

    const events = Array.isArray(body.events) ? body.events : [];
    const summary = {
      received: events.length,
      replied: 0,
      escalated: 0,
      duplicates: 0,
      ignored: 0,
      errors: 0,
      results: [],
    };

    for (const event of events) {
      console.log(
        JSON.stringify({
          tag: "line_webhook_event",
          eventType: event.type || null,
          userId: event && event.source ? event.source.userId || null : null,
          messageType: event && event.message ? event.message.type || null : null,
          text: event && event.message && event.message.type === "text" ? event.message.text || "" : "",
          eventId: event.webhookEventId || null,
        })
      );

      if (event.type !== "message" || !event.message || event.message.type !== "text") {
        summary.ignored += 1;
        continue;
      }

      const messageText = String(event.message.text || "").trim();
      const messageTextLower = messageText.toLowerCase();
      const userId = event.source ? event.source.userId : null;

      try {
        // Handle greetings first
        if (GREETING_KEYWORDS.some(kw => messageTextLower === kw || messageTextLower.includes(kw))) {
          if (event.replyToken) {
            await container.lineClient.replyWithQuickReplies(event.replyToken, GREETING_RESPONSE, QUICK_REPLIES);
            summary.replied += 1;
          }
          summary.results.push({
            eventId: event.webhookEventId,
            userId,
            status: "processed",
            action: "greeting",
          });
          continue;
        }

        // Handle button commands
        const buttonCommand = BUTTON_COMMANDS[messageTextLower] || BUTTON_COMMANDS[messageText];
        if (buttonCommand) {
          let response = "";

          if (buttonCommand === "talent_list") {
            const talents = container.castingService.getAllTalents();
            const talentList = talents.slice(0, 10).map((t, i) => {
              const riskEmoji = t.risk_level === "高" ? "🔴" : t.risk_level === "中" ? "🟡" : "🟢";
              return `${i + 1}. ${riskEmoji} ${t.name}（${t.name_en || "-"}）`;
            }).join("\n");
            response = `📋 タレント一覧\n━━━━━━━━━━━━━━━━━━━━━━\n\n${talentList}\n\n━━━━━━━━━━━━━━━━━━━━━━\n💡 タレント名を入力して詳細をお確かめください\n例:「田中太郎はビールに使える？」`;
          } else if (buttonCommand === "risk_list") {
            const highRisk = container.castingService.getTalentsByRisk("high");
            const medRisk = container.castingService.getTalentsByRisk("medium");

            let riskList = "🔴 高リスク:\n";
            riskList += highRisk.map(t => `・${t.name}（${t.name_en}）\n  ${t.scandal_history}`).join("\n") || "なし";
            riskList += "\n\n🟡 中リスク:\n";
            riskList += medRisk.map(t => `・${t.name}（${t.name_en}）\n  ${t.scandal_history}`).join("\n") || "なし";

            response = `⚠️ リスク一覧\n━━━━━━━━━━━━━━━━━━━━━━\n\n${riskList}\n\n━━━━━━━━━━━━━━━━━━━━━━\n💡「○○のリスク」で詳細確認`;
          } else if (buttonCommand === "expert_list") {
            const experts = container.castingService.experts;
            const expertList = experts.map(e =>
              `👤 ${e.name}（${e.name_en || "-"}）\n   📂 ${e.department}\n   🎯 ${e.specialization}\n   📧 ${e.contact_info}`
            ).join("\n\n");
            response = `🎯 専門家一覧\n━━━━━━━━━━━━━━━━━━━━━━\n\n${expertList}\n\n━━━━━━━━━━━━━━━━━━━━━━\n💡「韓国タレントに詳しい人」のように検索可能`;
          } else if (buttonCommand === "dashboard") {
            const stats = container.castingService.getDashboard();
            response = container.castingService.formatDashboardResponse(stats);
          } else if (buttonCommand === "recommend") {
            const talents = container.castingService.recommendTalents({
              cleanImage: true,
              limit: 3
            });
            response = container.castingService.formatRecommendationResponse(talents, "クリーンイメージ");
          }

          if (event.replyToken && response) {
            await container.lineClient.replyWithQuickReplies(event.replyToken, response, QUICK_REPLIES);
            summary.replied += 1;
          }
          summary.results.push({
            eventId: event.webhookEventId,
            userId,
            status: "processed",
            action: buttonCommand,
          });
          continue;
        }

        // Handle alerts command
        if (messageText === "アラート" || messageTextLower === "alerts" || messageText === "契約アラート") {
          const alerts = container.contractAlertService.generateAlerts();
          const alertResponse = container.contractAlertService.formatAlertsResponse(alerts);

          if (event.replyToken) {
            await container.lineClient.replyWithQuickReplies(event.replyToken, alertResponse, QUICK_REPLIES);
            summary.replied += 1;
          }

          summary.results.push({
            eventId: event.webhookEventId,
            userId,
            status: "processed",
            action: "alerts",
          });
          continue;
        }

        // Classify and handle casting-specific intents
        const classification = await container.classifier.classify({
          message: messageText,
          profile: null,
          recentContext: [],
        });

        const castingIntents = [
          "talent_ng_check",
          "scandal_risk_check",
          "contract_status",
          "expert_finder",
          "conflict_check",
        ];

        if (castingIntents.includes(classification.intent)) {
          const result = await handleCastingIntent(container, classification.intent, messageText);

          if (event.replyToken) {
            await container.lineClient.replyWithQuickReplies(event.replyToken, result.response, QUICK_REPLIES);
            summary.replied += 1;
          }

          summary.results.push({
            eventId: event.webhookEventId,
            userId,
            status: "processed",
            action: classification.intent,
            confidence: classification.confidence,
          });
          continue;
        }

        // Handle general casting query (if classified as such, reply helpfully)
        if (classification.intent === "general_casting_query" || classification.confidence < 0.5) {
          const helpResponse = `🤔 よく分かりませんでした。
   I'm not sure what you're asking about.

以下をお試しください / Try one of these:
• 「田中太郎はビールに使えますか？」→ NG Check
• 「佐藤健太のリスク」→ Risk Assessment
• 「韓国タレントに詳しい人」→ Expert Search
• 「アラート」→ Contract Alerts
• 「おすすめタレント」→ Recommendations

タレント名を含めてご質問ください。
Please include a talent name in your question.`;

          if (event.replyToken) {
            await container.lineClient.replyWithQuickReplies(event.replyToken, helpResponse, QUICK_REPLIES);
            summary.replied += 1;
          }

          summary.results.push({
            eventId: event.webhookEventId,
            userId,
            status: "processed",
            action: "help",
          });
          continue;
        }

        // Fall back to assistant service for other queries
        const result = await container.assistantService.handleLineMessageEvent(event);

        if (result.status === "duplicate") {
          summary.duplicates += 1;
        } else if (result.status === "ignored") {
          summary.ignored += 1;
        } else if (result.status === "processed") {
          if (result.action === "escalate") {
            summary.escalated += 1;
          }

          if (result.replyText && event.replyToken) {
            await container.lineClient.replyWithQuickReplies(event.replyToken, result.replyText, QUICK_REPLIES);
            summary.replied += 1;
          }
        }

        summary.results.push({
          eventId: result.eventId,
          userId: event && event.source ? event.source.userId || null : null,
          status: result.status,
          action: result.action || null,
          confidence: result.confidence || null,
        });
      } catch (error) {
        summary.errors += 1;
        summary.results.push({
          eventId: event.webhookEventId || null,
          status: "error",
          message: error.message,
        });
      }
    }

    return sendJson(res, 200, summary);
  };
}

async function handleCastingIntent(container, intent, messageText) {
  const castingService = container.castingService;

  switch (intent) {
    case "talent_ng_check": {
      const talentName = extractTalentName(messageText);
      // Also check for brand/category in the message
      const brandInfo = extractBrandOrCategory(messageText);
      const result = castingService.checkTalentAvailability(talentName, brandInfo.brand, brandInfo.category);
      return { result, response: castingService.formatAvailabilityResponse(result) };
    }
    case "scandal_risk_check": {
      const talentName = extractTalentName(messageText);
      const result = castingService.getScandalRisk(talentName);
      return { result, response: castingService.formatRiskResponse(result) };
    }
    case "contract_status": {
      const talentName = extractTalentName(messageText);
      const result = castingService.getContractStatus(talentName);
      return { result, response: castingService.formatContractStatusResponse(result) };
    }
    case "expert_finder": {
      const specialization = extractSpecialization(messageText);
      const experts = castingService.findExpert(specialization);
      return {
        result: { experts, specialization },
        response: castingService.formatExpertResponse(experts, specialization)
      };
    }
    case "conflict_check": {
      const talentName = extractTalentName(messageText);
      const result = castingService.checkContractConflicts(talentName, null);
      return { result, response: formatConflictResponse(result) };
    }
    default:
      return { result: null, response: "お問い合わせありがとうございます。" };
  }
}

function extractTalentName(query) {
  // Try Japanese patterns first
  const jpPatterns = [
    /(.+?)(?:さん)?(?:は|の|を|が)/,
    /(.+?)(?:について|のリスク|の契約|使える|使えますか)/,
  ];
  for (const pattern of jpPatterns) {
    const match = query.match(pattern);
    if (match && match[1] && match[1].length > 1) {
      return match[1].trim();
    }
  }

  // Try English patterns
  const enPatterns = [
    /^(?:can|is|does)\s+(.+?)\s+(?:do|available|work|have)/i,
    /^(.+?)\s+(?:risk|contract|available|scandal|beer|ad|commercial)/i,
    /^(.+?)\s+(?:for|can)/i,
  ];
  for (const pattern of enPatterns) {
    const match = query.match(pattern);
    if (match && match[1] && match[1].length > 1) {
      // Clean up extracted name
      let name = match[1].trim();
      // Remove common prefixes
      name = name.replace(/^(what's|what is|check|show|tell me about)\s*/i, "");
      if (name.length > 1) return name;
    }
  }

  // Fall back to first words (likely a name)
  const words = query.split(/\s+/);
  if (words.length >= 2) {
    // If first two words look like a name (capitalized), use them
    if (/^[A-Z]/.test(words[0]) && /^[A-Z]/.test(words[1])) {
      return `${words[0]} ${words[1]}`;
    }
  }

  return words[0];
}

function extractBrandOrCategory(query) {
  const brandKeywords = {
    "beer": "ビール",
    "ビール": "ビール",
    "alcohol": "酒類",
    "酒": "酒類",
    "car": "自動車",
    "自動車": "自動車",
    "cosmetics": "化粧品",
    "化粧品": "化粧品",
    "fashion": "ファッション",
    "sports": "スポーツ",
  };

  const lowerQuery = query.toLowerCase();
  for (const [keyword, category] of Object.entries(brandKeywords)) {
    if (lowerQuery.includes(keyword.toLowerCase())) {
      return { brand: null, category };
    }
  }

  return { brand: null, category: null };
}

function extractSpecialization(query) {
  // Japanese patterns
  const jpPatterns = [
    /(.+?)(?:に詳しい|の専門|担当|について)/,
    /(.+?)(?:タレント|アーティスト|の専門家)/,
  ];
  for (const pattern of jpPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // English patterns
  const enPatterns = [
    /(.+?)\s+(?:expert|specialist|team|contact)/i,
    /(?:who knows|find|expert for|specialist in)\s+(.+)/i,
  ];
  for (const pattern of enPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return query;
}

function formatConflictResponse(result) {
  if (!result.found) {
    return `❓ ${result.reason}`;
  }

  const name = result.talentEn
    ? `${result.talent} (${result.talentEn})`
    : result.talent;

  if (!result.hasConflict) {
    return `✅ ${name} has no conflicts\n✅ ${result.talent}さんには競合抵触はありません\n\n📄 Active contracts: ${result.activeContracts.length}`;
  }

  const conflictList = result.conflicts
    .map((c) => `・${c.client_name} (${c.brand}) - ${c.exclusivity_type}`)
    .join("\n");

  return `⚠️ ${name} has conflicts!\n⚠️ ${result.talent}さんに競合抵触があります\n\n📋 Conflicting contracts:\n${conflictList}`;
}

module.exports = createWebhookHandler();
module.exports.createWebhookHandler = createWebhookHandler;
module.exports.QUICK_REPLIES = QUICK_REPLIES;
