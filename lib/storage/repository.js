const { createId } = require("../utils/id");

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parsePriority(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function isoNow() {
  return new Date().toISOString();
}

class InMemoryRepository {
  constructor(options = {}) {
    this.retentionSeconds = options.retentionSeconds || 30 * 24 * 60 * 60;
    this.dedupeTtlSeconds = options.dedupeTtlSeconds || 24 * 60 * 60;
    this.profiles = new Map();
    this.knowledge = new Map();
    this.escalations = [];
    this.conversationLogs = [];
    this.processedEvents = new Map();
  }

  upsertProfiles(profiles) {
    const summary = { imported: 0, updated: 0, failed: 0 };

    for (const rawProfile of profiles) {
      const profile = {
        ...rawProfile,
        line_user_id: String(rawProfile.line_user_id || "").trim(),
      };

      if (!profile.line_user_id) {
        summary.failed += 1;
        continue;
      }

      profile.updated_at = profile.updated_at || isoNow();

      if (this.profiles.has(profile.line_user_id)) {
        summary.updated += 1;
      } else {
        summary.imported += 1;
      }

      this.profiles.set(profile.line_user_id, profile);
    }

    return summary;
  }

  upsertKnowledge(items) {
    const summary = { imported: 0, updated: 0, failed: 0 };

    for (const rawItem of items) {
      const itemId = String(rawItem.item_id || "").trim() || createId("knowledge");
      const item = {
        ...rawItem,
        item_id: itemId,
        category: String(rawItem.category || "job").toLowerCase(),
        priority: parsePriority(rawItem.priority),
      };

      if (!item.title) {
        summary.failed += 1;
        continue;
      }

      if (this.knowledge.has(itemId)) {
        summary.updated += 1;
      } else {
        summary.imported += 1;
      }

      this.knowledge.set(itemId, item);
    }

    return summary;
  }

  getProfile(lineUserId) {
    return this.profiles.get(String(lineUserId || "")) || null;
  }

  searchKnowledge(options = {}) {
    const { text = "", profile = null, limit = 5, now = new Date() } = options;
    const messageTokens = tokenize(text);
    const profileTags = Array.isArray(profile && profile.interest_tags)
      ? profile.interest_tags.map((tag) => String(tag).toLowerCase())
      : [];
    const profileLocation = String((profile && profile.location) || "").toLowerCase();

    const scored = [];

    for (const item of this.knowledge.values()) {
      if (item.deadline_iso) {
        const deadline = new Date(item.deadline_iso);
        if (Number.isFinite(deadline.getTime()) && deadline < now) {
          continue;
        }
      }

      const textBucket = [
        item.category,
        item.title,
        item.summary,
        item.eligibility,
        item.location,
        Array.isArray(item.tags) ? item.tags.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;

      for (const token of messageTokens) {
        if (textBucket.includes(token)) {
          score += 1;
        }
      }

      const itemTags = Array.isArray(item.tags)
        ? item.tags.map((tag) => String(tag).toLowerCase())
        : [];
      for (const tag of profileTags) {
        if (itemTags.includes(tag)) {
          score += 2;
        }
      }

      if (profileLocation && String(item.location || "").toLowerCase().includes(profileLocation)) {
        score += 1;
      }

      if (messageTokens.includes(item.category)) {
        score += 2;
      }

      score += Math.min(item.priority, 3) * 0.35;

      if (score > 0) {
        scored.push({ ...item, _score: score });
      }
    }

    scored.sort((a, b) => {
      if (b._score !== a._score) {
        return b._score - a._score;
      }
      const dateA = a.deadline_iso ? new Date(a.deadline_iso).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.deadline_iso ? new Date(b.deadline_iso).getTime() : Number.MAX_SAFE_INTEGER;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return String(a.item_id).localeCompare(String(b.item_id));
    });

    return scored.slice(0, limit).map((item) => {
      const cloned = { ...item };
      delete cloned._score;
      return cloned;
    });
  }

  addEscalation(item) {
    const escalation = {
      queue_id: item.queue_id || createId("esc"),
      created_at: item.created_at || isoNow(),
      status: item.status || "open",
      owner: item.owner || "manager",
      closed_at: item.closed_at || "",
      ...item,
    };
    this.escalations.push(escalation);
    return escalation;
  }

  listEscalations() {
    return [...this.escalations];
  }

  addConversation(log) {
    const now = Date.now();
    const expiresAt = log.expires_at
      ? new Date(log.expires_at).getTime()
      : now + this.retentionSeconds * 1000;

    const saved = {
      msg_id: log.msg_id || createId("msg"),
      timestamp: log.timestamp || isoNow(),
      expires_at: new Date(expiresAt).toISOString(),
      ...log,
    };

    this.conversationLogs.push(saved);
    return saved;
  }

  getRecentConversations(lineUserId, limit = 5) {
    this.cleanupExpired();

    return this.conversationLogs
      .filter((entry) => entry.line_user_id === lineUserId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  hasProcessedEvent(eventId) {
    this.cleanupExpired();
    const expiresAt = this.processedEvents.get(eventId);
    if (!expiresAt) {
      return false;
    }
    return expiresAt > Date.now();
  }

  markProcessedEvent(eventId, ttlSeconds) {
    const ttl = ttlSeconds || this.dedupeTtlSeconds;
    this.processedEvents.set(eventId, Date.now() + ttl * 1000);
  }

  cleanupExpired(nowTimestamp = Date.now()) {
    const beforeLogs = this.conversationLogs.length;
    this.conversationLogs = this.conversationLogs.filter(
      (entry) => new Date(entry.expires_at).getTime() > nowTimestamp
    );

    let dedupeRemoved = 0;
    for (const [eventId, expiresAt] of this.processedEvents.entries()) {
      if (expiresAt <= nowTimestamp) {
        this.processedEvents.delete(eventId);
        dedupeRemoved += 1;
      }
    }

    return {
      removedLogs: beforeLogs - this.conversationLogs.length,
      removedDedupe: dedupeRemoved,
    };
  }
}

module.exports = {
  InMemoryRepository,
};
