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
  { type: "action", action: { type: "message", label: "タレント検索", text: "タレント検索" } },
  { type: "action", action: { type: "message", label: "契約アラート", text: "アラート" } },
  { type: "action", action: { type: "message", label: "NG条件", text: "NG条件チェック" } },
  { type: "action", action: { type: "message", label: "専門家検索", text: "専門家を探す" } },
];

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
      const userId = event.source ? event.source.userId : null;

      try {
        // Handle alerts command
        if (messageText === "アラート" || messageText === "/alerts" || messageText === "契約アラート") {
          const alerts = container.contractAlertService.generateAlerts();
          const alertResponse = container.contractAlertService.formatAlertsResponse(alerts);

          if (event.replyToken) {
            await container.lineClient.replyText(event.replyToken, alertResponse);
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
            await container.lineClient.replyText(event.replyToken, result.response);
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
            await container.lineClient.replyText(event.replyToken, result.replyText);
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
      const result = castingService.checkTalentAvailability(talentName, null, null);
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
  const patterns = [
    /(.+?)(?:さん)?(?:は|の|を)/,
    /(.+?)(?:について|のリスク|の契約)/,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return query.split(/\s/)[0];
}

function extractSpecialization(query) {
  const patterns = [
    /(.+?)(?:に詳しい|の専門|担当)/,
    /(.+?)(?:タレント|アーティスト)/,
  ];
  for (const pattern of patterns) {
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

  if (!result.hasConflict) {
    return `✅ ${result.talent}さんには競合抵触はありません\n\n有効契約: ${result.activeContracts.length}件`;
  }

  const conflictList = result.conflicts
    .map((c) => `・${c.client_name} (${c.brand}) - ${c.exclusivity_type}`)
    .join("\n");

  return `⚠️ ${result.talent}さんに競合抵触があります\n\n抵触契約:\n${conflictList}`;
}

module.exports = createWebhookHandler();
module.exports.createWebhookHandler = createWebhookHandler;
module.exports.QUICK_REPLIES = QUICK_REPLIES;
