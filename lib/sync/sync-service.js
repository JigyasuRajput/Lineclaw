const fs = require("fs/promises");
const { parseCsv, parseTagList } = require("../utils/csv");
const { DEFAULT_PROFILES_CSV, DEFAULT_KNOWLEDGE_CSV } = require("./default-csv");

function toIsoDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function normalizeProfile(row) {
  return {
    line_user_id: row.line_user_id || row.user_id || row.lineId || "",
    display_name: row.display_name || row.name || "",
    language_pref: row.language_pref || row.language || "",
    interest_tags: parseTagList(row.interest_tags || row.tags || row.interests || ""),
    location: row.location || "",
    career_goal: row.career_goal || row.goal || "",
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

function normalizeKnowledge(row) {
  return {
    item_id: row.item_id || row.id || "",
    category: (row.category || "job").toLowerCase(),
    title: row.title || "",
    summary: row.summary || row.description || "",
    eligibility: row.eligibility || "",
    location: row.location || "",
    deadline_iso: toIsoDate(row.deadline_iso || row.deadline || ""),
    url: row.url || row.link || "",
    tags: parseTagList(row.tags || row.interest_tags || ""),
    priority: row.priority || "0",
  };
}

async function readTextFromLocal(path) {
  return fs.readFile(path, "utf8");
}

async function readTextFromUrl(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV (${response.status}) from ${url}`);
  }
  return response.text();
}

class ProfileSyncService {
  constructor(options) {
    this.config = options.config;
    this.repository = options.repository;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async sync(source = "csv") {
    const normalizedSource = source === "sheet" ? "sheet" : "csv";

    const [profilesText, knowledgeText] = await Promise.all([
      this.#loadProfiles(normalizedSource),
      this.#loadKnowledge(normalizedSource),
    ]);

    const profiles = parseCsv(profilesText).map(normalizeProfile);
    const knowledgeItems = parseCsv(knowledgeText).map(normalizeKnowledge);

    const profileSummary = this.repository.upsertProfiles(profiles);
    const knowledgeSummary = this.repository.upsertKnowledge(knowledgeItems);

    return {
      imported: profileSummary.imported + knowledgeSummary.imported,
      updated: profileSummary.updated + knowledgeSummary.updated,
      failed: profileSummary.failed + knowledgeSummary.failed,
      profileSummary,
      knowledgeSummary,
    };
  }

  async #loadProfiles(source) {
    if (source === "sheet") {
      const url = this.config.sync.profilesSheetCsvUrl;
      if (!url) {
        throw new Error("SHEETS_PROFILES_CSV_URL is missing");
      }
      return readTextFromUrl(url, this.fetchImpl);
    }
    try {
      return await readTextFromLocal(this.config.sync.profilesCsvPath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return DEFAULT_PROFILES_CSV;
      }
      throw error;
    }
  }

  async #loadKnowledge(source) {
    if (source === "sheet") {
      const url = this.config.sync.knowledgeSheetCsvUrl;
      if (!url) {
        throw new Error("SHEETS_KNOWLEDGE_CSV_URL is missing");
      }
      return readTextFromUrl(url, this.fetchImpl);
    }
    try {
      return await readTextFromLocal(this.config.sync.knowledgeCsvPath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return DEFAULT_KNOWLEDGE_CSV;
      }
      throw error;
    }
  }
}

module.exports = {
  ProfileSyncService,
  normalizeProfile,
  normalizeKnowledge,
};
