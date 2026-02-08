const { getContainer } = require("../../lib/container");
const { verifyLineSignature } = require("../../lib/line/signature");
const {
  getHeader,
  getRawBody,
  parseJsonBody,
  sendJson,
  sendMethodNotAllowed,
} = require("../../lib/utils/http");

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

      try {
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

module.exports = createWebhookHandler();
module.exports.createWebhookHandler = createWebhookHandler;
