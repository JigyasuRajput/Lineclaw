const path = require("path");

function envNumber(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function loadConfig(env = process.env) {
  const rootDir = process.cwd();

  return {
    appName: env.APP_NAME || "Hakuhodo Casting Assistant",
    botName: env.BOT_NAME || "キャスティングアシスタントAI",
    clientName: env.CLIENT_NAME || "Hakuhodo DY Group",
    thresholds: {
      answer: envNumber(env, "CONFIDENCE_ANSWER_THRESHOLD", 0.70),
      clarify: envNumber(env, "CONFIDENCE_CLARIFY_THRESHOLD", 0.45),
    },
    casting: {
      contractAlertDays: envNumber(env, "CONTRACT_ALERT_DAYS", 30),
      confidenceThreshold: envNumber(env, "CONFIDENCE_THRESHOLD_CASTING", 0.70),
      enableProactiveAlerts: envBool(env.ENABLE_PROACTIVE_ALERTS, true),
      alertSchedule: env.ALERT_SCHEDULE || "0 9 * * 1-5", // Weekdays at 9 AM JST
    },
    retentionSeconds: envNumber(env, "CONVERSATION_RETENTION_SECONDS", 30 * 24 * 60 * 60),
    dedupeTtlSeconds: envNumber(env, "DEDUPE_TTL_SECONDS", 24 * 60 * 60),
    openai: {
      apiKey: env.OPENAI_API_KEY || "",
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
    },
    line: {
      channelSecret: env.LINE_CHANNEL_SECRET || "",
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN || "",
      managerUserId: env.LINE_MANAGER_USER_ID || "",
    },
    admin: {
      apiKey: env.ADMIN_API_KEY || "",
    },
    sync: {
      talentsCsvPath: path.resolve(rootDir, env.TALENTS_CSV_PATH || "data/talents.csv"),
      contractsCsvPath: path.resolve(rootDir, env.CONTRACTS_CSV_PATH || "data/contracts.csv"),
      expertsCsvPath: path.resolve(rootDir, env.EXPERTS_CSV_PATH || "data/experts.csv"),
      // Legacy paths for backward compatibility
      profilesCsvPath: path.resolve(rootDir, env.PROFILES_CSV_PATH || "data/profiles.csv"),
      knowledgeCsvPath: path.resolve(rootDir, env.KNOWLEDGE_CSV_PATH || "data/knowledge.csv"),
      profilesSheetCsvUrl: env.SHEETS_PROFILES_CSV_URL || "",
      knowledgeSheetCsvUrl: env.SHEETS_KNOWLEDGE_CSV_URL || "",
    },
    escalation: {
      queueCsvPath: path.resolve(rootDir, env.ESCALATION_QUEUE_CSV_PATH || "data/escalations.csv"),
      queueWebhookUrl: env.ESCALATION_SHEET_WEBHOOK_URL || "",
    },
    flags: {
      disableExternalAI: envBool(env.DISABLE_EXTERNAL_AI, false),
      allowUnsignedWebhook: envBool(env.ALLOW_UNSIGNED_WEBHOOK, false),
    },
  };
}

module.exports = {
  loadConfig,
};
