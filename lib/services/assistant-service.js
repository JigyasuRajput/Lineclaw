const { computeConfidence, decideAction } = require("./policy");

class AssistantService {
  constructor(options = {}) {
    this.repository = options.repository;
    this.conversationMemory = options.conversationMemory || null;
    this.classifier = options.classifier;
    this.generator = options.generator;
    this.lineClient = options.lineClient;
    this.escalationSink = options.escalationSink;
    this.config = options.config;
  }

  async handleLineMessageEvent(event) {
    const userId = event && event.source ? event.source.userId : "";
    const text = event && event.message ? String(event.message.text || "") : "";
    const eventId =
      event.webhookEventId ||
      (event.message && event.message.id) ||
      `${userId || "unknown"}:${event.timestamp || Date.now()}`;

    if (!userId || !text.trim()) {
      return {
        status: "ignored",
        reason: "non_text_or_missing_user",
        eventId,
      };
    }

    if (this.repository.hasProcessedEvent(eventId)) {
      return {
        status: "duplicate",
        eventId,
      };
    }

    this.repository.markProcessedEvent(eventId, this.config.dedupeTtlSeconds);

    const normalizedText = text.trim().toLowerCase();
    if (normalizedText === "whoami" || normalizedText === "/whoami") {
      const replyText = `Your LINE userId:\n${userId}`;
      const logPayload = {
        line_user_id: userId,
        user_text: text,
        assistant_text: replyText,
        intent: "utility_whoami",
        confidence: 1,
        action: "answered",
      };

      const log = this.conversationMemory
        ? await this.conversationMemory.add(logPayload)
        : this.repository.addConversation(logPayload);

      return {
        status: "processed",
        eventId,
        action: "answer",
        replyText,
        confidence: 1,
        classification: {
          intent: "utility_whoami",
          is_sensitive: false,
        },
        profile: this.repository.getProfile(userId),
        matches: [],
        escalation: null,
        log,
      };
    }

    const profile = this.repository.getProfile(userId);
    const recentContext = this.conversationMemory
      ? await this.conversationMemory.getRecent(userId, 5)
      : this.repository.getRecentConversations(userId, 5);
    const classification = await this.classifier.classify({
      message: text,
      profile,
      recentContext,
    });
    const matches = this.repository.searchKnowledge({
      text,
      profile,
      limit: 5,
    });

    const confidence = computeConfidence({
      classification,
      matches,
      profile,
    });

    const alreadyClarified = recentContext.some((entry) => entry.action === "clarified");

    const action = decideAction({
      confidence,
      intent: classification.intent,
      isSensitive: classification.is_sensitive,
      alreadyClarified,
      thresholds: this.config.thresholds,
    });

    let replyText = "";
    let escalation = null;

    if (action === "answer") {
      replyText = await this.generator.generateAnswer({
        language: profile && profile.language_pref,
        userText: text,
        profile,
        intent: classification.intent,
        matches,
      });
    } else if (action === "clarify") {
      replyText = this.generator.generateClarifyingQuestion({
        language: profile && profile.language_pref,
        userText: text,
      });
    } else {
      replyText = this.generator.generateEscalationNotice({
        language: profile && profile.language_pref,
        userText: text,
      });

      const suggestedReply = classification.is_sensitive
        ? ""
        : await this.generator.generateAnswer({
            language: profile && profile.language_pref,
            userText: text,
            profile,
            intent: classification.intent,
            matches,
          });

      escalation = this.repository.addEscalation({
        line_user_id: userId,
        message_text: text,
        reason_code: classification.is_sensitive ? "sensitive" : "low_confidence",
        suggested_reply: suggestedReply,
      });

      await this.#recordEscalation(escalation, classification, confidence);
    }

    const logPayload = {
      line_user_id: userId,
      user_text: text,
      assistant_text: replyText,
      intent: classification.intent,
      confidence,
      action: action === "answer" ? "answered" : action === "clarify" ? "clarified" : "escalated",
    };

    const log = this.conversationMemory
      ? await this.conversationMemory.add(logPayload)
      : this.repository.addConversation(logPayload);

    return {
      status: "processed",
      eventId,
      action,
      replyText,
      confidence,
      classification,
      profile,
      matches,
      escalation,
      log,
    };
  }

  async #recordEscalation(escalation, classification, confidence) {
    try {
      await this.escalationSink.record(escalation);
    } catch (error) {
      escalation.sink_error = error.message;
    }

    const managerUserId = this.config.line.managerUserId;
    const summary = this.#formatManagerNotification({
      escalation,
      classification,
      confidence,
    });

    try {
      await this.lineClient.pushText(managerUserId, summary);
    } catch (error) {
      escalation.notify_error = error.message;
    }
  }

  #formatManagerNotification(input) {
    const escalation = input.escalation;
    return [
      "[Escalation] Talent inquiry needs review",
      `Queue ID: ${escalation.queue_id}`,
      `User: ${escalation.line_user_id}`,
      `Reason: ${escalation.reason_code}`,
      `Intent: ${input.classification.intent}`,
      `Confidence: ${input.confidence.toFixed(2)}`,
      `Message: ${escalation.message_text}`,
      escalation.suggested_reply ? `Suggested reply: ${escalation.suggested_reply}` : "Suggested reply: (none)",
    ].join("\n");
  }
}

module.exports = {
  AssistantService,
};
