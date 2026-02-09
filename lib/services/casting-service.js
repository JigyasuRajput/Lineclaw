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

class CastingService {
    constructor(options = {}) {
        this.config = options.config;
        this.generator = options.generator;
        this.dataDir = options.dataDir || path.resolve(process.cwd(), "data");
        this._talents = null;
        this._contracts = null;
        this._experts = null;
    }

    get talents() {
        if (!this._talents) {
            this._talents = loadCSV(path.join(this.dataDir, "talents.csv"));
        }
        return this._talents;
    }

    get contracts() {
        if (!this._contracts) {
            this._contracts = loadCSV(path.join(this.dataDir, "contracts.csv"));
        }
        return this._contracts;
    }

    get experts() {
        if (!this._experts) {
            this._experts = loadCSV(path.join(this.dataDir, "experts.csv"));
        }
        return this._experts;
    }

    reloadData() {
        this._talents = null;
        this._contracts = null;
        this._experts = null;
    }

    findTalent(talentName) {
        const normalized = talentName.toLowerCase();
        return this.talents.find((t) => t.name.toLowerCase().includes(normalized));
    }

    checkTalentAvailability(talentName, brand, category) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                available: null,
                talent: null,
                reason: "タレントが見つかりませんでした",
            };
        }

        const ngBrands = talent.ng_brands ? talent.ng_brands.split("|") : [];
        const ngCategories = talent.ng_categories ? talent.ng_categories.split("|") : [];

        const brandConflict = ngBrands.some((ng) =>
            brand && brand.toLowerCase().includes(ng.toLowerCase())
        );
        const categoryConflict = ngCategories.some((ng) =>
            category && category.toLowerCase().includes(ng.toLowerCase())
        );

        if (brandConflict || categoryConflict) {
            return {
                available: false,
                talent,
                reason: brandConflict
                    ? `${brand}はNGブランドに該当します`
                    : `${category}はNGカテゴリに該当します`,
                ngBrands,
                ngCategories,
            };
        }

        const activeContracts = this.contracts.filter(
            (c) => c.talent_name === talent.name
        );
        const conflictingContract = activeContracts.find((c) => {
            const restrictions = c.competitive_restrictions || "";
            return (
                restrictions.toLowerCase().includes((category || "").toLowerCase()) ||
                restrictions.toLowerCase().includes((brand || "").toLowerCase())
            );
        });

        if (conflictingContract) {
            return {
                available: false,
                talent,
                reason: `既存契約(${conflictingContract.client_name})との競合抵触があります`,
                conflictingContract,
            };
        }

        return {
            available: true,
            talent,
            reason: "起用可能です",
            cautions: talent.scandal_history !== "なし" ? [talent.scandal_history] : [],
            expertContact: talent.expert_contact,
        };
    }

    getScandalRisk(talentName) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                found: false,
                reason: "タレントが見つかりませんでした",
            };
        }

        return {
            found: true,
            talent: talent.name,
            riskLevel: talent.risk_level,
            scandalHistory: talent.scandal_history,
            expertContact: talent.expert_contact,
            expertDepartment: talent.expert_department,
            recommendation:
                talent.risk_level === "高"
                    ? "起用前にリスク管理部への相談を推奨します"
                    : talent.risk_level === "中"
                        ? "案件内容によっては注意が必要です"
                        : "特に懸念事項はありません",
        };
    }

    findExpert(specialization) {
        const normalized = specialization.toLowerCase();
        const matches = this.experts.filter(
            (e) =>
                e.specialization.toLowerCase().includes(normalized) ||
                e.department.toLowerCase().includes(normalized)
        );
        return matches;
    }

    checkContractConflicts(talentName, proposedClient) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                found: false,
                reason: "タレントが見つかりませんでした",
            };
        }

        const activeContracts = this.contracts.filter(
            (c) => c.talent_name === talent.name
        );

        const conflicts = activeContracts.filter((c) => {
            if (c.exclusivity_type === "完全独占") {
                return true;
            }
            const restrictions = c.competitive_restrictions || "";
            return restrictions !== "なし" && proposedClient;
        });

        return {
            found: true,
            talent: talent.name,
            activeContracts,
            conflicts,
            hasConflict: conflicts.length > 0,
        };
    }

    getContractStatus(talentName) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                found: false,
                reason: "タレントが見つかりませんでした",
            };
        }

        const contracts = this.contracts.filter((c) => c.talent_name === talent.name);
        return {
            found: true,
            talent: talent.name,
            contracts,
            expertContact: talent.expert_contact,
        };
    }

    formatAvailabilityResponse(result) {
        if (result.available === null) {
            return `❓ ${result.reason}`;
        }

        if (result.available) {
            let response = `✅ ${result.talent.name}さんは起用可能です\n`;
            if (result.cautions && result.cautions.length > 0) {
                response += `\n⚠️ 注意事項:\n${result.cautions.map((c) => `・${c}`).join("\n")}\n`;
            }
            if (result.expertContact) {
                response += `\n💡 詳細は${result.expertContact}さんにご相談ください`;
            }
            return response;
        }

        let response = `❌ ${result.talent.name}さんは現在起用できません\n\n理由:\n・${result.reason}`;
        if (result.ngBrands && result.ngBrands.length > 0) {
            response += `\n\nNGブランド: ${result.ngBrands.join(", ")}`;
        }
        if (result.ngCategories && result.ngCategories.length > 0) {
            response += `\nNGカテゴリ: ${result.ngCategories.join(", ")}`;
        }
        return response;
    }

    formatRiskResponse(result) {
        if (!result.found) {
            return `❓ ${result.reason}`;
        }

        const riskEmoji =
            result.riskLevel === "高" ? "🔴" : result.riskLevel === "中" ? "🟡" : "🟢";

        return `🔍 ${result.talent}さんのリスク評価

総合評価: ${riskEmoji} ${result.riskLevel}リスク

過去の問題:
・${result.scandalHistory}

推奨: ${result.recommendation}

📞 担当: ${result.expertContact}さん (${result.expertDepartment})`;
    }

    formatExpertResponse(experts, specialization) {
        if (experts.length === 0) {
            return `❓ 「${specialization}」の専門家が見つかりませんでした`;
        }

        const expertList = experts
            .map(
                (e) =>
                    `・${e.name}さん (${e.department})\n  専門: ${e.specialization}\n  連絡先: ${e.contact_info}`
            )
            .join("\n\n");

        return `🎯 ${specialization}の専門チーム

最適な相談相手:
${expertList}`;
    }

    formatContractStatusResponse(result) {
        if (!result.found) {
            return `❓ ${result.reason}`;
        }

        if (result.contracts.length === 0) {
            return `📄 ${result.talent}さんには現在有効な契約がありません`;
        }

        const contractList = result.contracts
            .map(
                (c) =>
                    `・${c.client_name} (${c.brand})\n  期間: ${c.start_date} 〜 ${c.end_date}\n  状況: ${c.renewal_status}`
            )
            .join("\n\n");

        return `📄 ${result.talent}さんの契約状況

${contractList}

💡 担当: ${result.expertContact}さん`;
    }
}

module.exports = {
    CastingService,
};
