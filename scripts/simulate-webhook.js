#!/usr/bin/env node
const { createContainer } = require("../lib/container");

async function main() {
  const message = process.argv.slice(2).join(" ") || "Any auditions in Tokyo this month?";

  const container = createContainer({
    env: {
      ...process.env,
      DISABLE_EXTERNAL_AI: process.env.DISABLE_EXTERNAL_AI || "true",
      ALLOW_UNSIGNED_WEBHOOK: process.env.ALLOW_UNSIGNED_WEBHOOK || "true",
    },
  });

  try {
    await container.syncService.sync("csv");
  } catch (error) {
    console.warn(`Sync warning: ${error.message}`);
  }

  const event = {
    type: "message",
    webhookEventId: `sim_${Date.now()}`,
    timestamp: Date.now(),
    source: {
      type: "user",
      userId: process.env.SIM_USER_ID || "U1001",
    },
    message: {
      id: `mid_${Date.now()}`,
      type: "text",
      text: message,
    },
    replyToken: "simulated-reply-token",
  };

  const result = await container.assistantService.handleLineMessageEvent(event);

  console.log(JSON.stringify({
    input: event.message.text,
    action: result.action,
    confidence: result.confidence,
    reply: result.replyText,
    escalation: result.escalation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
