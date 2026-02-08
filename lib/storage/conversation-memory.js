const { createId } = require("../utils/id");

function tryLoadKv() {
  try {
    const moduleRef = require("@vercel/kv");
    return moduleRef.kv || null;
  } catch (error) {
    return null;
  }
}

class ConversationMemory {
  constructor(options = {}) {
    this.retentionSeconds = options.retentionSeconds || 30 * 24 * 60 * 60;
    this.kv = options.kv || tryLoadKv();
    this.memory = [];
  }

  isUsingKv() {
    return Boolean(this.kv);
  }

  async add(log) {
    const now = Date.now();
    const expiresAt = log.expires_at
      ? new Date(log.expires_at).getTime()
      : now + this.retentionSeconds * 1000;

    const saved = {
      msg_id: log.msg_id || createId("msg"),
      timestamp: log.timestamp || new Date(now).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      ...log,
    };

    if (this.kv) {
      const key = this.#key(saved.line_user_id);
      const current = (await this.kv.get(key)) || [];
      const next = [saved, ...current]
        .filter((entry) => new Date(entry.expires_at).getTime() > now)
        .slice(0, 80);
      await this.kv.set(key, next, { ex: this.retentionSeconds });
      return saved;
    }

    this.memory.push(saved);
    return saved;
  }

  async getRecent(lineUserId, limit = 5) {
    const now = Date.now();

    if (this.kv) {
      const key = this.#key(lineUserId);
      const current = (await this.kv.get(key)) || [];
      const filtered = current.filter((entry) => new Date(entry.expires_at).getTime() > now);
      if (filtered.length !== current.length) {
        await this.kv.set(key, filtered, { ex: this.retentionSeconds });
      }
      return filtered.slice(0, limit);
    }

    this.memory = this.memory.filter((entry) => new Date(entry.expires_at).getTime() > now);
    return this.memory
      .filter((entry) => entry.line_user_id === lineUserId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  cleanup(nowTimestamp = Date.now()) {
    if (this.kv) {
      return {
        removedLogs: 0,
        mode: "vercel-kv",
      };
    }

    const before = this.memory.length;
    this.memory = this.memory.filter((entry) => new Date(entry.expires_at).getTime() > nowTimestamp);
    return {
      removedLogs: before - this.memory.length,
      mode: "memory",
    };
  }

  #key(lineUserId) {
    return `conv:${lineUserId}`;
  }
}

module.exports = {
  ConversationMemory,
};
