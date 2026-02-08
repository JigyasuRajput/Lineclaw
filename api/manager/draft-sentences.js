const { getContainer } = require("../../lib/container");
const { parseJsonBody, sendJson, sendMethodNotAllowed } = require("../../lib/utils/http");
const { isAuthorizedAdmin } = require("../../lib/utils/auth");

function createDraftHandler(containerProvider = getContainer) {
  return async function draftSentencesHandler(req, res) {
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

    const payload = {
      audience_tag: body.audience_tag,
      purpose: body.purpose,
      tone: body.tone,
      language: body.language,
    };

    const result = await container.managerService.draftSentences(payload);
    return sendJson(res, 200, result);
  };
}

module.exports = createDraftHandler();
module.exports.createDraftHandler = createDraftHandler;
