const { loadConfig } = require("./config");
const { InMemoryRepository } = require("./storage/repository");
const { ConversationMemory } = require("./storage/conversation-memory");
const { OpenAIClient } = require("./ai/openai-client");
const { InquiryClassifier } = require("./ai/classifier");
const { ResponseGenerator } = require("./ai/generator");
const { LineClient } = require("./line/client");
const { ProfileSyncService } = require("./sync/sync-service");
const { EscalationSink } = require("./sync/escalation-sink");
const { AssistantService } = require("./services/assistant-service");
const { ManagerService } = require("./services/manager-service");
const { RetentionService } = require("./services/retention-service");

let singleton = null;

function createContainer(options = {}) {
  const config = options.config || loadConfig(options.env);
  const repository =
    options.repository ||
    new InMemoryRepository({
      retentionSeconds: config.retentionSeconds,
      dedupeTtlSeconds: config.dedupeTtlSeconds,
    });

  const openaiClient =
    options.openaiClient ||
    new OpenAIClient({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: config.openai.model,
      fetchImpl: options.fetchImpl,
    });

  const conversationMemory =
    options.conversationMemory ||
    new ConversationMemory({
      retentionSeconds: config.retentionSeconds,
    });

  const classifier =
    options.classifier ||
    new InquiryClassifier({
      openaiClient,
      disableExternalAI: config.flags.disableExternalAI,
    });

  const generator =
    options.generator ||
    new ResponseGenerator({
      openaiClient,
      disableExternalAI: config.flags.disableExternalAI,
    });

  const lineClient =
    options.lineClient ||
    new LineClient({
      channelAccessToken: config.line.channelAccessToken,
      fetchImpl: options.fetchImpl,
    });

  const escalationSink =
    options.escalationSink ||
    new EscalationSink({
      queueCsvPath: config.escalation.queueCsvPath,
      queueWebhookUrl: config.escalation.queueWebhookUrl,
      fetchImpl: options.fetchImpl,
    });

  const syncService =
    options.syncService ||
    new ProfileSyncService({
      config,
      repository,
      fetchImpl: options.fetchImpl,
    });

  const assistantService =
    options.assistantService ||
    new AssistantService({
      repository,
      classifier,
      generator,
      lineClient,
      escalationSink,
      conversationMemory,
      config,
    });

  const managerService = options.managerService || new ManagerService({ generator });
  const retentionService =
    options.retentionService ||
    new RetentionService({
      repository,
      conversationMemory,
    });

  return {
    config,
    repository,
    conversationMemory,
    openaiClient,
    classifier,
    generator,
    lineClient,
    escalationSink,
    syncService,
    assistantService,
    managerService,
    retentionService,
  };
}

function getContainer() {
  if (!singleton) {
    singleton = createContainer();
  }
  return singleton;
}

function resetContainer() {
  singleton = null;
}

module.exports = {
  createContainer,
  getContainer,
  resetContainer,
};
