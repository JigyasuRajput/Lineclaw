function getHeader(req, name) {
  if (!req || !req.headers) {
    return undefined;
  }
  const target = String(name).toLowerCase();
  const entries = Object.entries(req.headers);
  for (const [key, value] of entries) {
    if (String(key).toLowerCase() === target) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

async function getRawBody(req) {
  if (!req) {
    return "";
  }

  if (typeof req.rawBody === "string") {
    return req.rawBody;
  }

  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }

  if (typeof req.on !== "function") {
    return "";
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(error));
  });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = await getRawBody(req);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    error.message = `Invalid JSON body: ${error.message}`;
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res, allowed) {
  res.setHeader("allow", allowed.join(", "));
  sendJson(res, 405, {
    error: "method_not_allowed",
    message: `Use one of: ${allowed.join(", ")}`,
  });
}

module.exports = {
  getHeader,
  getRawBody,
  parseJsonBody,
  sendJson,
  sendMethodNotAllowed,
};
