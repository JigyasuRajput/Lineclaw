const fs = require("fs/promises");
const path = require("path");

const ESCALATION_HEADERS = [
  "queue_id",
  "created_at",
  "line_user_id",
  "message_text",
  "reason_code",
  "suggested_reply",
  "status",
  "owner",
  "closed_at",
];

function escapeCsvValue(value) {
  const stringValue = value == null ? "" : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function toCsvLine(record) {
  return `${ESCALATION_HEADERS.map((header) => escapeCsvValue(record[header])).join(",")}\n`;
}

class EscalationSink {
  constructor(options = {}) {
    this.queueCsvPath = options.queueCsvPath;
    this.queueWebhookUrl = options.queueWebhookUrl;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async record(escalationItem) {
    if (this.queueWebhookUrl) {
      await this.#sendWebhook(escalationItem);
      return { mode: "webhook" };
    }

    if (this.queueCsvPath) {
      await this.#appendCsv(escalationItem);
      return { mode: "csv" };
    }

    return { mode: "none" };
  }

  async #sendWebhook(escalationItem) {
    const response = await this.fetchImpl(this.queueWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(escalationItem),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Escalation webhook failed (${response.status}): ${text}`);
    }
  }

  async #appendCsv(escalationItem) {
    const dir = path.dirname(this.queueCsvPath);
    await fs.mkdir(dir, { recursive: true });

    let needsHeader = false;
    try {
      const stat = await fs.stat(this.queueCsvPath);
      if (!stat || stat.size === 0) {
        needsHeader = true;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        needsHeader = true;
      } else {
        throw error;
      }
    }

    if (needsHeader) {
      await fs.appendFile(this.queueCsvPath, `${ESCALATION_HEADERS.join(",")}\n`, "utf8");
    }

    await fs.appendFile(this.queueCsvPath, toCsvLine(escalationItem), "utf8");
  }
}

module.exports = {
  EscalationSink,
  ESCALATION_HEADERS,
};
