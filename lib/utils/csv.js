function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  function pushValue() {
    row.push(value);
    value = "";
  }

  function pushRow() {
    if (row.length === 1 && row[0] === "" && rows.length === 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushValue();
      continue;
    }

    if (char === "\n") {
      pushValue();
      pushRow();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    value += char;
  }

  pushValue();
  if (row.length > 1 || row[0] !== "") {
    pushRow();
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = (cells[i] || "").trim();
    }
    return record;
  });
}

function stringifyCsv(records, headers) {
  const output = [headers.join(",")];
  for (const record of records) {
    const row = headers.map((header) => {
      const raw = record[header] == null ? "" : String(record[header]);
      const escaped = raw.replace(/"/g, '""');
      if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
        return `"${escaped}"`;
      }
      return escaped;
    });
    output.push(row.join(","));
  }
  return `${output.join("\n")}\n`;
}

function parseTagList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[|,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

module.exports = {
  parseCsv,
  stringifyCsv,
  parseTagList,
};
