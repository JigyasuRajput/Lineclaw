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
      interest_tags: ["casting", "talent"],
      location: "Tokyo",
      career_goal: "casting staff",
    },
    {
      line_user_id: "U1002",
      display_name: "Emma",
      language_pref: "en",
      interest_tags: ["casting", "talent"],
      location: "Tokyo",
      career_goal: "casting staff",
    },
  ]);

  container.repository.upsertKnowledge([
    {
      item_id: "K001",
      category: "casting",
      title: "Talent Casting Guidelines",
      summary: "Guidelines for casting",
      eligibility: "All staff",
      location: "Tokyo",
      deadline_iso: "2026-12-01",
      url: "https://example.com/casting-guide",
      tags: ["casting", "guidelines"],
      priority: 3,
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
      text: overrides.text || "タレントの情報を教えて",
    },
    replyToken: overrides.replyToken || "dummy-reply-token",
  };
}

test("Talent NG check query is classified correctly", async () => {
  const container = buildTestContainer();
  const result = await container.classifier.classify({
    message: "田中太郎はビールのCMに使えますか？",
    profile: null,
    recentContext: [],
  });

  assert.equal(result.intent, "talent_ng_check");
  assert.ok(result.confidence >= 0.7);
});

test("Scandal risk check query is classified correctly", async () => {
  const container = buildTestContainer();
  const result = await container.classifier.classify({
    message: "佐藤健太のリスクを教えて",
    profile: null,
    recentContext: [],
  });

  assert.equal(result.intent, "scandal_risk_check");
  assert.ok(result.confidence >= 0.7);
});

test("Expert finder query is classified correctly", async () => {
  const container = buildTestContainer();
  const result = await container.classifier.classify({
    message: "韓国タレントに詳しい人は？",
    profile: null,
    recentContext: [],
  });

  assert.equal(result.intent, "expert_finder");
  assert.ok(result.confidence >= 0.7);
});

test("Contract status query is classified correctly", async () => {
  const container = buildTestContainer();
  const result = await container.classifier.classify({
    message: "鈴木花子の契約状況は？",
    profile: null,
    recentContext: [],
  });

  assert.equal(result.intent, "contract_status");
  assert.ok(result.confidence >= 0.7);
});

test("Casting service returns talent availability", async () => {
  const container = buildTestContainer();
  const result = container.castingService.checkTalentAvailability("田中太郎", "アサヒビール", null);

  assert.equal(result.available, false);
  assert.ok(result.reason.includes("NG"));
});

test("Casting service returns available status for valid talent/brand", async () => {
  const container = buildTestContainer();
  const result = container.castingService.checkTalentAvailability("山本美咲", "新規ブランド", null);

  assert.equal(result.available, true);
  assert.ok(result.talent);
});

test("Contract alert service detects expiring contracts", async () => {
  const container = buildTestContainer();
  const expiring = container.contractAlertService.getExpiringContracts(60);

  assert.ok(Array.isArray(expiring));
});

test("Unknown inquiry triggers clarifying question", async () => {
  const container = buildTestContainer();
  const result = await container.assistantService.handleLineMessageEvent(
    makeEvent({ userId: "U9999", text: "Can you help?" })
  );

  assert.equal(result.action, "clarify");
  assert.match(result.replyText.toLowerCase(), /share|help|教えて|タレント|ブランド/);
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

test("Duplicate webhook event is idempotent", async () => {
  const container = buildTestContainer();
  const event = makeEvent({ userId: "U1001", text: "タレントの契約について", webhookEventId: "evt_dup_1" });

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
    intent: "general_casting_query",
    confidence: 0.9,
    action: "answered",
    expires_at: "2020-01-01T00:00:00.000Z",
  });

  const cleanup = container.retentionService.cleanup(new Date("2026-02-06T00:00:00.000Z").getTime());
  assert.equal(cleanup.removedLogs, 1);
});
