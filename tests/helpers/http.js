function createMockReq(options = {}) {
  return {
    method: options.method || "POST",
    headers: options.headers || {},
    body: options.body,
    rawBody: options.rawBody,
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(payload) {
      this.ended = true;
      this.body = payload || "";
    },
  };
}

function parseJsonBody(res) {
  return res.body ? JSON.parse(res.body) : {};
}

module.exports = {
  createMockReq,
  createMockRes,
  parseJsonBody,
};
