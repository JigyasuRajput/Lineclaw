const test = require("node:test");
const assert = require("node:assert/strict");
const { createContainer } = require("../lib/container");
const { createLineSignature } = require("../lib/line/signature");
const { createWebhookHandler } = require("../api/line/webhook");
const { createDraftHandler } = require("../api/manager/draft-sentences");
const { createProfileSyncHandler } = require("../api/admin/profiles/sync");
const { createMockReq, createMockRes, parseJsonBody } = require("./helpers/http");

test("Signature verification rejects invalid requests", async () => {
  const container = createContainer({
    env: {
      LINE_CHANNEL_SECRET: "secret123",
      DISABLE_EXTERNAL_AI: "true",
    },
  });

  const handler = createWebhookHandler(() => container);
  const payload = { events: [] };
  const rawBody = JSON.stringify(payload);

  const req = createMockReq({
    method: "POST",
    headers: { "x-line-signature": "invalid" },
    body: payload,
    rawBody,
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(parseJsonBody(res).error, "invalid_signature");
});

test("Webhook accepts valid signature", async () => {
  const container = createContainer({
    env: {
      LINE_CHANNEL_SECRET: "secret123",
      DISABLE_EXTERNAL_AI: "true",
    },
  });

  const handler = createWebhookHandler(() => container);
  const payload = { events: [] };
  const rawBody = JSON.stringify(payload);
  const signature = createLineSignature(rawBody, "secret123");

  const req = createMockReq({
    method: "POST",
    headers: { "x-line-signature": signature },
    body: payload,
    rawBody,
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(parseJsonBody(res).received, 0);
});

test("Manager draft endpoint returns 3 distinct candidate lines", async () => {
  const container = createContainer({
    env: {
      DISABLE_EXTERNAL_AI: "true",
      ADMIN_API_KEY: "admin-test-key",
    },
  });

  const handler = createDraftHandler(() => container);
  const req = createMockReq({
    method: "POST",
    headers: { "x-admin-key": "admin-test-key" },
    body: {
      audience_tag: "audition",
      purpose: "Send top weekend casting options",
      tone: "friendly",
      language: "en",
    },
  });
  const res = createMockRes();

  await handler(req, res);

  const json = parseJsonBody(res);
  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(json.candidates), true);
  assert.equal(json.candidates.length, 3);
  assert.equal(new Set(json.candidates).size, 3);
});

test("Profile sync endpoint imports CSV data", async () => {
  const container = createContainer({
    env: {
      DISABLE_EXTERNAL_AI: "true",
      ADMIN_API_KEY: "admin-test-key",
    },
  });

  const handler = createProfileSyncHandler(() => container);
  const req = createMockReq({
    method: "POST",
    headers: { "x-admin-key": "admin-test-key" },
    body: {
      source: "csv",
    },
  });
  const res = createMockRes();

  await handler(req, res);

  const json = parseJsonBody(res);
  assert.equal(res.statusCode, 200);
  assert.ok(json.imported > 0 || json.updated > 0);
});
