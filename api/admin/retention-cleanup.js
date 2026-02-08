const { getContainer } = require("../../lib/container");
const { sendJson, sendMethodNotAllowed } = require("../../lib/utils/http");
const { isAuthorizedAdmin } = require("../../lib/utils/auth");

function createCleanupHandler(containerProvider = getContainer) {
  return async function cleanupHandler(req, res) {
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

    const result = container.retentionService.cleanup();
    return sendJson(res, 200, result);
  };
}

module.exports = createCleanupHandler();
module.exports.createCleanupHandler = createCleanupHandler;
