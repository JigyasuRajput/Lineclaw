const { getContainer } = require("../../../lib/container");
const { parseJsonBody, sendJson, sendMethodNotAllowed } = require("../../../lib/utils/http");
const { isAuthorizedAdmin } = require("../../../lib/utils/auth");

function createProfileSyncHandler(containerProvider = getContainer) {
  return async function profileSyncHandler(req, res) {
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

    const source = body.source === "sheet" ? "sheet" : "csv";

    try {
      const summary = await container.syncService.sync(source);
      return sendJson(res, 200, summary);
    } catch (error) {
      return sendJson(res, 500, {
        error: "sync_failed",
        message: error.message,
      });
    }
  };
}

module.exports = createProfileSyncHandler();
module.exports.createProfileSyncHandler = createProfileSyncHandler;
