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

    // Enhanced bilingual talent search
    findTalent(talentName) {
        const normalized = talentName.toLowerCase().trim();

        // Try exact match first (Japanese or English name)
        let talent = this.talents.find((t) =>
            t.name.toLowerCase() === normalized ||
            (t.name_en && t.name_en.toLowerCase() === normalized)
        );
        if (talent) return talent;

        // Try partial match (Japanese or English name)
        talent = this.talents.find((t) =>
            t.name.toLowerCase().includes(normalized) ||
            (t.name_en && t.name_en.toLowerCase().includes(normalized)) ||
            normalized.includes(t.name.toLowerCase()) ||
            (t.name_en && normalized.includes(t.name_en.toLowerCase()))
        );
        if (talent) return talent;

        // Try matching parts of the name (for "Taro" matching "Taro Tanaka")
        const nameParts = normalized.split(/\s+/);
        talent = this.talents.find((t) => {
            const jpParts = t.name.toLowerCase();
            const enParts = (t.name_en || "").toLowerCase().split(/\s+/);
            return nameParts.some(part =>
                jpParts.includes(part) ||
                enParts.some(enPart => enPart.includes(part) || part.includes(enPart))
            );
        });

        return talent || null;
    }

    // Get all talents (for listing)
    getAllTalents() {
        return this.talents;
    }

    // Get high-risk talents
    getHighRiskTalents() {
        return this.talents.filter(t => t.risk_level === "高");
    }

    // Get talents by risk level
    getTalentsByRisk(riskLevel) {
        const levelMap = {
            "high": "高", "medium": "中", "low": "低",
            "高": "高", "中": "中", "低": "低"
        };
        const level = levelMap[riskLevel.toLowerCase()] || riskLevel;
        return this.talents.filter(t => t.risk_level === level);
    }

    checkTalentAvailability(talentName, brand, category) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                available: null,
                talent: null,
                reason: "タレントが見つかりませんでした / Talent not found",
            };
        }

        const ngBrands = talent.ng_brands ? talent.ng_brands.split("|") : [];
        const ngCategories = talent.ng_categories ? talent.ng_categories.split("|") : [];

        // Check brand NG
        const brandConflict = ngBrands.some((ng) =>
            brand && (
                brand.toLowerCase().includes(ng.toLowerCase()) ||
                ng.toLowerCase().includes(brand.toLowerCase())
            )
        );

        // Check category NG  
        const categoryConflict = ngCategories.some((ng) =>
            category && (
                category.toLowerCase().includes(ng.toLowerCase()) ||
                ng.toLowerCase().includes(category.toLowerCase())
            )
        );

        // Also check for alcohol/beer keywords
        const alcoholKeywords = ["beer", "ビール", "alcohol", "酒", "wine", "ワイン", "whisky", "ウイスキー"];
        const isAlcoholQuery = alcoholKeywords.some(kw =>
            (brand && brand.toLowerCase().includes(kw)) ||
            (category && category.toLowerCase().includes(kw))
        );
        const hasAlcoholNG = ngCategories.some(ng => ng.includes("酒"));

        if (brandConflict || categoryConflict || (isAlcoholQuery && hasAlcoholNG)) {
            return {
                available: false,
                talent,
                reason: brandConflict
                    ? `${brand} is an NG brand / ${brand}はNGブランドに該当します`
                    : `This category is restricted / このカテゴリはNGです`,
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
                reason: `Conflict with existing contract (${conflictingContract.client_name}) / 既存契約との競合抵触があります`,
                conflictingContract,
            };
        }

        return {
            available: true,
            talent,
            reason: "Available for casting / 起用可能です",
            cautions: talent.scandal_history !== "なし" ? [talent.scandal_history] : [],
            expertContact: talent.expert_contact,
        };
    }

    getScandalRisk(talentName) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                found: false,
                reason: "タレントが見つかりませんでした / Talent not found",
            };
        }

        const riskMap = { "高": "High", "中": "Medium", "低": "Low" };
        const riskEn = riskMap[talent.risk_level] || talent.risk_level;

        return {
            found: true,
            talent: talent.name,
            talentEn: talent.name_en,
            riskLevel: talent.risk_level,
            riskLevelEn: riskEn,
            scandalHistory: talent.scandal_history,
            expertContact: talent.expert_contact,
            expertDepartment: talent.expert_department,
            recommendation:
                talent.risk_level === "高"
                    ? "Consult Risk Management before casting / 起用前にリスク管理部への相談を推奨します"
                    : talent.risk_level === "中"
                        ? "Caution needed depending on project / 案件内容によっては注意が必要です"
                        : "No concerns / 特に懸念事項はありません",
        };
    }

    // Enhanced bilingual expert search
    findExpert(specialization) {
        const normalized = specialization.toLowerCase().trim();

        // Map common English terms to Japanese
        const termMap = {
            "korean": "韓国", "kpop": "K-POP", "k-pop": "K-POP",
            "fashion": "ファッション", "model": "モデル",
            "sports": "スポーツ", "athlete": "アスリート",
            "scandal": "スキャンダル", "crisis": "危機管理", "risk": "リスク",
            "actor": "俳優", "actress": "女優",
            "idol": "アイドル",
            "contract": "契約", "legal": "法務", "rights": "権利"
        };

        // Expand search terms
        let searchTerms = [normalized];
        for (const [en, jp] of Object.entries(termMap)) {
            if (normalized.includes(en)) {
                searchTerms.push(jp.toLowerCase());
            }
        }

        const matches = this.experts.filter((e) => {
            const jpSpec = (e.specialization || "").toLowerCase();
            const enSpec = (e.specialization_en || "").toLowerCase();
            const jpDept = (e.department || "").toLowerCase();
            const jpName = (e.name || "").toLowerCase();
            const enName = (e.name_en || "").toLowerCase();

            return searchTerms.some(term =>
                jpSpec.includes(term) ||
                enSpec.includes(term) ||
                jpDept.includes(term) ||
                jpName.includes(term) ||
                enName.includes(term)
            );
        });

        return matches;
    }

    checkContractConflicts(talentName, proposedClient) {
        const talent = this.findTalent(talentName);
        if (!talent) {
            return {
                found: false,
                reason: "タレントが見つかりませんでした / Talent not found",
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
            talentEn: talent.name_en,
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
                reason: "タレントが見つかりませんでした / Talent not found",
            };
        }

        const contracts = this.contracts.filter((c) => c.talent_name === talent.name);
        return {
            found: true,
            talent: talent.name,
            talentEn: talent.name_en,
            contracts,
            expertContact: talent.expert_contact,
        };
    }

    formatAvailabilityResponse(result) {
        if (result.available === null) {
            return `❓ ${result.reason}`;
        }

        const name = result.talent.name_en
            ? `${result.talent.name} (${result.talent.name_en})`
            : result.talent.name;

        if (result.available) {
            let response = `✅ ${name} is available for casting!\n✅ ${result.talent.name}さんは起用可能です\n`;
            if (result.cautions && result.cautions.length > 0) {
                response += `\n⚠️ Caution / 注意事項:\n${result.cautions.map((c) => `・${c}`).join("\n")}\n`;
            }
            if (result.expertContact) {
                response += `\n💡 Contact ${result.expertContact} for details\n💡 詳細は${result.expertContact}さんにご相談ください`;
            }
            return response;
        }

        let response = `❌ ${name} cannot be used for this project\n❌ ${result.talent.name}さんは現在起用できません\n\n📋 Reason / 理由:\n・${result.reason}`;
        if (result.ngBrands && result.ngBrands.length > 0) {
            response += `\n\n🚫 NG Brands / NGブランド: ${result.ngBrands.join(", ")}`;
        }
        if (result.ngCategories && result.ngCategories.length > 0) {
            response += `\n🚫 NG Categories / NGカテゴリ: ${result.ngCategories.join(", ")}`;
        }
        return response;
    }

    formatRiskResponse(result) {
        if (!result.found) {
            return `❓ ${result.reason}`;
        }

        const riskEmoji =
            result.riskLevel === "高" ? "🔴" : result.riskLevel === "中" ? "🟡" : "🟢";

        const name = result.talentEn
            ? `${result.talent} (${result.talentEn})`
            : result.talent;

        return `🔍 Risk Assessment for ${name}
🔍 ${result.talent}さんのリスク評価

📊 Overall Risk / 総合評価: ${riskEmoji} ${result.riskLevelEn} / ${result.riskLevel}リスク

📰 History / 過去の問題:
・${result.scandalHistory}

💡 Recommendation / 推奨:
${result.recommendation}

📞 Contact / 担当: ${result.expertContact} (${result.expertDepartment})`;
    }

    formatExpertResponse(experts, specialization) {
        if (experts.length === 0) {
            return `❓ No expert found for "${specialization}"\n❓ 「${specialization}」の専門家が見つかりませんでした`;
        }

        const expertList = experts
            .map((e) => {
                const name = e.name_en ? `${e.name} (${e.name_en})` : e.name;
                const spec = e.specialization_en
                    ? `${e.specialization} / ${e.specialization_en}`
                    : e.specialization;
                return `・${name}\n  📂 ${e.department}\n  🎯 ${spec}\n  📧 ${e.contact_info}`;
            })
            .join("\n\n");

        return `🎯 Experts for ${specialization}
🎯 ${specialization}の専門チーム

Best contacts / 最適な相談相手:

${expertList}`;
    }

    formatContractStatusResponse(result) {
        if (!result.found) {
            return `❓ ${result.reason}`;
        }

        const name = result.talentEn
            ? `${result.talent} (${result.talentEn})`
            : result.talent;

        if (result.contracts.length === 0) {
            return `📄 ${name} has no active contracts\n📄 ${result.talent}さんには現在有効な契約がありません`;
        }

        const contractList = result.contracts
            .map((c) =>
                `・${c.client_name} (${c.brand})\n  📅 ${c.start_date} → ${c.end_date}\n  📋 ${c.renewal_status}`
            )
            .join("\n\n");

        return `📄 Contract Status for ${name}
📄 ${result.talent}さんの契約状況

${contractList}

💡 Contact / 担当: ${result.expertContact}`;
    }
}

module.exports = {
    CastingService,
};
