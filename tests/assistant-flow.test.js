const test = require("node:test");
const assert = require("node:assert/strict");
const { createContainer } = require("../lib/container");

function buildTestContainer() {
  const container = createContainer({
    env: {
      DISABLE_EXTERNAL_AI: "true",
      ALLOW_UNSIGNED_WEBHOOK: "true",
    },
    escalationSink: {
      async record() {
        return { mode: "test" };
      },
    },
  });

  container.repository.upsertProfiles([
    {
      line_user_id: "U1001",
      display_name: "Yuki",
      language_pref: "ja",
      interest_tags: ["audition", "tokyo"],
      location: "Tokyo",
      career_goal: "voice actor",
    },
    {
      line_user_id: "U1002",
      display_name: "Emma",
      language_pref: "en",
      interest_tags: ["school", "acting"],
      location: "Los Angeles",
      career_goal: "screen actor",
    },
  ]);

  container.repository.upsertKnowledge([
    {
      item_id: "K001",
      category: "audition",
      title: "Tokyo Voice Audition",
      summary: "Animation role",
      eligibility: "Beginner welcome",
      location: "Tokyo",
      deadline_iso: "2026-12-01",
      url: "https://example.com/tokyo-audition",
      tags: ["audition", "tokyo"],
      priority: 3,
    },
    {
      item_id: "K002",
      category: "school",
      title: "LA Acting School Weekend",
      summary: "On-camera basics",
      eligibility: "English required",
      location: "Los Angeles",
      deadline_iso: "2026-09-01",
      url: "https://example.com/la-school",
      tags: ["school", "acting"],
      priority: 2,
    },
  ]);

  return container;
}

function makeEvent(overrides = {}) {
  return {
    type: "message",
    webhookEventId: overrides.webhookEventId || `evt_${Date.now()}_${Math.random()}`,
    timestamp: overrides.timestamp || Date.now(),
    source: {
      type: "user",
      userId: overrides.userId || "U1001",
    },
    message: {
      id: overrides.messageId || `m_${Date.now()}_${Math.random()}`,
      type: "text",
      text: overrides.text || "Any auditions in Tokyo?",
    },
    replyToken: overrides.replyToken || "dummy-reply-token",
  };
}

test("FAQ inquiry with profile tags returns personalized answer", async () => {
  const container = buildTestContainer();
  const result = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U1001", text: "Any audition opportunities in Tokyo this week?" })
  );

  assert.equal(result.action, "answer");
  assert.match(result.replyText, /Yuki/);
  assert.match(result.replyText, /Tokyo|東京/);
});

test("Unknown inquiry triggers clarifying question", async () => {
  const container = buildTestContainer();
  const result = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U9999", text: "Can you help?" })
  );

  assert.equal(result.action, "clarify");
  assert.match(result.replyText.toLowerCase(), /share|help|教えて|希望/);
});

test("Low-confidence inquiry escalates and logs queue item", async () => {
  const container = buildTestContainer();
  const result = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U9999", text: "hmm" })
  );

  assert.equal(result.action, "escalate");
  assert.ok(result.escalation);
  assert.equal(container.repository.listEscalations().length, 1);
});

test("Sensitive inquiry escalates without suggested advice", async () => {
  const container = buildTestContainer();
  const result = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U1001", text: "I have a legal contract dispute" })
  );

  assert.equal(result.action, "escalate");
  assert.ok(result.escalation);
  assert.equal(result.escalation.suggested_reply, "");
});

test("JP and EN inquiries each receive same-language replies", async () => {
  const container = buildTestContainer();

  const jaResult = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U1001", text: "東京のオーディションありますか？" })
  );
  assert.equal(jaResult.action, "answer");
  assert.match(jaResult.replyText, /[\u3040-\u30ff\u4e00-\u9faf]/);

  const enResult = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U1002", text: "Any acting school options in Los Angeles?" })
  );
  assert.equal(enResult.action, "answer");
  assert.match(enResult.replyText, /Hi Emma|Location|Deadline/);
});

test("Duplicate webhook event is idempotent", async () => {
  const container = buildTestContainer();
  const event = makeEvent({ userId: "U1001", text: "Any auditions?", webhookEventId: "evt_dup_1" });

  const first = await container.assistantService.handleLineMessageEvent(event);
  const second = await container.assistantService.handleLineMessageEvent(event);
  const logs = await container.conversationMemory.getRecent("U1001", 5);

  assert.equal(first.status, "processed");
  assert.equal(second.status, "duplicate");
  assert.equal(logs.length, 1);
});

test("whoami command returns the sender LINE userId", async () => {
  const container = buildTestContainer();
  const result = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U1002", text: "whoami" })
  );

  assert.equal(result.action, "answer");
  assert.match(result.replyText, /U1002/);
  assert.equal(result.classification.intent, "utility_whoami");
});

test("Retention cleanup removes expired conversation logs", async () => {
  const container = buildTestContainer();

  await container.conversationMemory.add({
    line_user_id: "U1001",
    user_text: "old",
    assistant_text: "old",
    intent: "faq",
    confidence: 0.9,
    action: "answered",
    expires_at: "2020-01-01T00:00:00.000Z",
  });

  const cleanup = container.retentionService.cleanup(new Date("2026-02-06T00:00:00.000Z").getTime());
  assert.equal(cleanup.removedLogs, 1);
});
