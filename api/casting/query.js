const { getContainer } = require("../../lib/container");
const {
    sendJson,
    sendMethodNotAllowed,
    parseJsonBody,
} = require("../../lib/utils/http");

function createQueryHandler(containerProvider = getContainer) {
    return async function queryHandler(req, res) {
        if (req.method !== "POST") {
            return sendMethodNotAllowed(res, ["POST"]);
        }

        const container = containerProvider();

        let body;
        try {
            body = req.body && typeof req.body === "object" ? req.body : await parseJsonBody(req);
        } catch (error) {
            return sendJson(res, 400, {
                error: "invalid_json",
                message: error.message,
            });
        }

        const { query, userId, brand, category, talentName } = body;

        if (!query) {
            return sendJson(res, 400, {
                error: "missing_query",
                message: "query field is required",
            });
        }

        try {
            const classification = await container.classifier.classify({
                message: query,
                profile: null,
                recentContext: [],
            });

            let result = null;
            let formattedResponse = "";

            switch (classification.intent) {
                case "talent_ng_check": {
                    const name = talentName || extractTalentName(query);
                    result = container.castingService.checkTalentAvailability(name, brand, category);
                    formattedResponse = container.castingService.formatAvailabilityResponse(result);
                    break;
                }
                case "scandal_risk_check": {
                    const name = talentName || extractTalentName(query);
                    result = container.castingService.getScandalRisk(name);
                    formattedResponse = container.castingService.formatRiskResponse(result);
                    break;
                }
                case "contract_status": {
                    const name = talentName || extractTalentName(query);
                    result = container.castingService.getContractStatus(name);
                    formattedResponse = container.castingService.formatContractStatusResponse(result);
                    break;
                }
                case "expert_finder": {
                    const specialization = extractSpecialization(query);
                    const experts = container.castingService.findExpert(specialization);
                    result = { experts, specialization };
                    formattedResponse = container.castingService.formatExpertResponse(experts, specialization);
                    break;
                }
                case "conflict_check": {
                    const name = talentName || extractTalentName(query);
                    result = container.castingService.checkContractConflicts(name, brand);
                    formattedResponse = formatConflictResponse(result);
                    break;
                }
                default: {
                    formattedResponse = await container.generator.generateAnswer({
                        userText: query,
                        intent: classification.intent,
                        language: "ja",
                    });
                    break;
                }
            }

            return sendJson(res, 200, {
                query,
                intent: classification.intent,
                confidence: classification.confidence,
                result,
                response: formattedResponse,
            });
        } catch (error) {
            return sendJson(res, 500, {
                error: "processing_error",
                message: error.message,
            });
        }
    };
}

function extractTalentName(query) {
    const patterns = [
        /(.+?)(?:さん)?(?:は|の|を)/,
        /(.+?)(?:について|のリスク|の契約)/,
    ];
    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return query.split(/\s/)[0];
}

function extractSpecialization(query) {
    const patterns = [
        /(.+?)(?:に詳しい|の専門|担当)/,
        /(.+?)(?:タレント|アーティスト)/,
    ];
    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return query;
}

function formatConflictResponse(result) {
    if (!result.found) {
        return `❓ ${result.reason}`;
    }

    if (!result.hasConflict) {
        return `✅ ${result.talent}さんには競合抵触はありません\n\n有効契約: ${result.activeContracts.length}件`;
    }

    const conflictList = result.conflicts
        .map((c) => `・${c.client_name} (${c.brand}) - ${c.exclusivity_type}`)
        .join("\n");

    return `⚠️ ${result.talent}さんに競合抵触があります\n\n抵触契約:\n${conflictList}`;
}

module.exports = createQueryHandler();
module.exports.createQueryHandler = createQueryHandler;
