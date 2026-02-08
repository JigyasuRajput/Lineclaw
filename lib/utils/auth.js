const { getHeader } = require("./http");

function isAuthorizedAdmin(req, config) {
  const expected = config.admin.apiKey;
  if (!expected) {
    return true;
  }

  const provided = getHeader(req, "x-admin-key");
  return String(provided || "") === String(expected);
}

module.exports = {
  isAuthorizedAdmin,
};
