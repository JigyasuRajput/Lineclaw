function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    return "https://api.openai.com/v1";
  }
  return baseUrl.replace(/\/$/, "");
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("OpenAI returned empty content");
  }

  try {
    return JSON.parse(trimmed);
  } catch (initialError) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }
    throw initialError;
  }
}

class OpenAIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || "";
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.model = options.model || "gpt-4.1-mini";
    this.fetchImpl = options.fetchImpl || fetch;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async chatJson({ systemPrompt, userPrompt, temperature = 0.2, maxTokens = 600 }) {
    if (!this.isConfigured()) {
      return null;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const payload = await response.json();
    const content =
      payload && payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content
        : "";

    return parseJsonObjectFromText(content);
  }
}

module.exports = {
  OpenAIClient,
};
