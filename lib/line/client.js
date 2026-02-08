class LineClient {
  constructor(options) {
    this.channelAccessToken = options.channelAccessToken || "";
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async replyText(replyToken, text) {
    if (!replyToken) {
      return { skipped: true, reason: "missing_reply_token" };
    }
    return this.#sendMessage("reply", {
      replyToken,
      messages: [{ type: "text", text }],
    });
  }

  async pushText(to, text) {
    if (!to) {
      return { skipped: true, reason: "missing_manager_user_id" };
    }
    return this.#sendMessage("push", {
      to,
      messages: [{ type: "text", text }],
    });
  }

  async #sendMessage(path, payload) {
    if (!this.channelAccessToken) {
      return { skipped: true, reason: "missing_access_token", payload };
    }

    const response = await this.fetchImpl(`https://api.line.me/v2/bot/message/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.channelAccessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`LINE API failed (${response.status}): ${text}`);
      error.status = response.status;
      throw error;
    }

    return { ok: true };
  }
}

module.exports = {
  LineClient,
};
