const { getContainer } = require("../../lib/container");
const {
    sendJson,
    sendMethodNotAllowed,
    parseJsonBody,
    getQueryParam,
} = require("../../lib/utils/http");

function createAlertsHandler(containerProvider = getContainer) {
    return async function alertsHandler(req, res) {
        const container = containerProvider();

        if (req.method === "GET") {
            const daysAhead = parseInt(getQueryParam(req, "daysAhead") || "30", 10);

            try {
                const alerts = container.contractAlertService.generateAlerts();
                const expiring = container.contractAlertService.getExpiringContracts(daysAhead);

                return sendJson(res, 200, {
                    daysAhead,
                    totalAlerts: alerts.length,
                    expiringContracts: expiring.length,
                    alerts,
                    formattedResponse: container.contractAlertService.formatAlertsResponse(alerts),
                });
            } catch (error) {
                return sendJson(res, 500, {
                    error: "processing_error",
                    message: error.message,
                });
            }
        }

        if (req.method === "POST") {
            let body;
            try {
                body = req.body && typeof req.body === "object" ? req.body : await parseJsonBody(req);
            } catch (error) {
                return sendJson(res, 400, {
                    error: "invalid_json",
                    message: error.message,
                });
            }

            const { targetUsers, alertType } = body;

            if (!targetUsers || !Array.isArray(targetUsers) || targetUsers.length === 0) {
                return sendJson(res, 400, {
                    error: "missing_target_users",
                    message: "targetUsers array is required",
                });
            }

            try {
                const alerts = container.contractAlertService.generateAlerts();
                const filteredAlerts = alertType
                    ? alerts.filter((a) => a.type === alertType)
                    : alerts;

                const formattedMessage = container.contractAlertService.formatAlertsResponse(filteredAlerts);

                const results = [];
                for (const userId of targetUsers) {
                    try {
                        await container.lineClient.pushText(userId, formattedMessage);
                        results.push({ userId, status: "sent" });
                    } catch (error) {
                        results.push({ userId, status: "failed", error: error.message });
                    }
                }

                return sendJson(res, 200, {
                    alertType: alertType || "all",
                    alertCount: filteredAlerts.length,
                    pushResults: results,
                });
            } catch (error) {
                return sendJson(res, 500, {
                    error: "processing_error",
                    message: error.message,
                });
            }
        }

        return sendMethodNotAllowed(res, ["GET", "POST"]);
    };
}

module.exports = createAlertsHandler();
module.exports.createAlertsHandler = createAlertsHandler;
