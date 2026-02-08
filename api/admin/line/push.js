const { getContainer } = require("../../../lib/container");
const { parseJsonBody, sendJson, sendMethodNotAllowed } = require("../../../lib/utils/http");
const { isAuthorizedAdmin } = require("../../../lib/utils/auth");

function createPushHandler(containerProvider = getContainer) {
  return async function pushHandler(req, res) {
    if (req.method !== "POST") {
      return sendMethodNotAllowed(res, ["POST"]);
    }

    const container = containerProvider();
    if (!isAuthorizedAdmin(req, container.config)) {
      return sendJson(res, 401, {
        error: "unauthorized",
        message: "Missing or invalid x-admin-key",
      });
    }

    let body;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, {
        error: "invalid_json",
        message: error.message,
      });
    }

    const to = String(body.to || "").trim();
    const text = String(body.text || "").trim();

    if (!to || !text) {
      return sendJson(res, 400, {
        error: "invalid_payload",
        message: "`to` and `text` are required",
      });
    }

    if (text.length > 1000) {
      return sendJson(res, 400, {
        error: "invalid_payload",
        message: "`text` must be <= 1000 characters",
      });
    }

    try {
      const pushResult = await container.lineClient.pushText(to, text);
      return sendJson(res, 200, {
        ok: true,
        to,
        pushResult,
      });
    } catch (error) {
      return sendJson(res, 502, {
        error: "line_push_failed",
        message: error.message,
      });
    }
  };
}

module.exports = createPushHandler();
module.exports.createPushHandler = createPushHandler;
