const fs = require("fs");
const path = require("path");

function parseCSV(content) {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
        const values = line.split(",");
        const obj = {};
        headers.forEach((h, i) => {
            obj[h.trim()] = values[i] ? values[i].trim() : "";
        });
        return obj;
    });
}

function loadCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return parseCSV(content);
    } catch (error) {
        console.error(`Failed to load CSV: ${filePath}`, error.message);
        return [];
    }
}

function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

class ContractAlertService {
    constructor(options = {}) {
        this.config = options.config;
        this.dataDir = options.dataDir || path.resolve(process.cwd(), "data");
        this._contracts = null;
        this._talents = null;
    }

    get contracts() {
        if (!this._contracts) {
            this._contracts = loadCSV(path.join(this.dataDir, "contracts.csv"));
        }
        return this._contracts;
    }

    get talents() {
        if (!this._talents) {
            this._talents = loadCSV(path.join(this.dataDir, "talents.csv"));
        }
        return this._talents;
    }

    reloadData() {
        this._contracts = null;
        this._talents = null;
    }

    getExpiringContracts(daysAhead = 30) {
        const today = new Date();
        const expiring = [];

        for (const contract of this.contracts) {
            if (!contract.end_date) continue;

            const daysUntilExpiry = daysBetween(today, contract.end_date);

            if (daysUntilExpiry >= 0 && daysUntilExpiry <= daysAhead) {
                expiring.push({
                    ...contract,
                    daysUntilExpiry,
                    urgency:
                        daysUntilExpiry <= 7
                            ? "critical"
                            : daysUntilExpiry <= 14
                                ? "high"
                                : "normal",
                });
            }
        }

        return expiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    }

    detectConflicts(talentName) {
        const talentContracts = this.contracts.filter(
            (c) => c.talent_name.toLowerCase() === talentName.toLowerCase()
        );

        const conflicts = [];

        for (const contract of talentContracts) {
            if (contract.exclusivity_type === "完全独占") {
                conflicts.push({
                    type: "exclusivity",
                    contract,
                    message: `${contract.client_name}との完全独占契約があります`,
                });
            }

            if (
                contract.competitive_restrictions &&
                contract.competitive_restrictions !== "なし"
            ) {
                conflicts.push({
                    type: "competitive",
                    contract,
                    message: `競合制限: ${contract.competitive_restrictions}`,
                });
            }
        }

        return conflicts;
    }

    generateAlerts() {
        const alerts = [];
        const alertDays = this.config?.casting?.contractAlertDays || 30;

        // Expiring contracts
        const expiring = this.getExpiringContracts(alertDays);
        for (const contract of expiring) {
            alerts.push({
                type: "expiring_contract",
                urgency: contract.urgency,
                talent: contract.talent_name,
                client: contract.client_name,
                brand: contract.brand,
                daysUntilExpiry: contract.daysUntilExpiry,
                endDate: contract.end_date,
                renewalStatus: contract.renewal_status,
                assignedManager: contract.assigned_manager,
            });
        }

        // High-risk talents with active contracts
        for (const talent of this.talents) {
            if (talent.risk_level === "高") {
                const activeContracts = this.contracts.filter(
                    (c) => c.talent_name === talent.name
                );
                if (activeContracts.length > 0) {
                    alerts.push({
                        type: "high_risk_talent",
                        urgency: "high",
                        talent: talent.name,
                        riskLevel: talent.risk_level,
                        scandalHistory: talent.scandal_history,
                        activeContracts: activeContracts.length,
                        expertContact: talent.expert_contact,
                    });
                }
            }
        }

        return alerts.sort((a, b) => {
            const urgencyOrder = { critical: 0, high: 1, normal: 2 };
            return (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
        });
    }

    formatAlertsResponse(alerts) {
        if (alerts.length === 0) {
            return "✅ 現在アラートはありません";
        }

        const expiringAlerts = alerts.filter((a) => a.type === "expiring_contract");
        const riskAlerts = alerts.filter((a) => a.type === "high_risk_talent");

        let response = "⚠️ 契約アラート一覧\n";

        if (expiringAlerts.length > 0) {
            response += "\n📅 期限切れ間近の契約:\n";
            for (const alert of expiringAlerts) {
                const urgencyEmoji =
                    alert.urgency === "critical"
                        ? "🔴"
                        : alert.urgency === "high"
                            ? "🟡"
                            : "🟢";
                response += `\n${urgencyEmoji} ${alert.talent}さん × ${alert.client}\n`;
                response += `   ${alert.brand} | 残り${alert.daysUntilExpiry}日 (${alert.endDate})\n`;
                response += `   状況: ${alert.renewalStatus}\n`;
                response += `   担当: ${alert.assignedManager}さん\n`;
            }
        }

        if (riskAlerts.length > 0) {
            response += "\n🔍 要注意タレント:\n";
            for (const alert of riskAlerts) {
                response += `\n🔴 ${alert.talent}さん (リスク: ${alert.riskLevel})\n`;
                response += `   履歴: ${alert.scandalHistory}\n`;
                response += `   有効契約: ${alert.activeContracts}件\n`;
                response += `   相談先: ${alert.expertContact}さん\n`;
            }
        }

        return response;
    }
}

module.exports = {
    ContractAlertService,
};
