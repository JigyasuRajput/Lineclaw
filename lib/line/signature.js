const crypto = require("crypto");

function createLineSignature(rawBody, channelSecret) {
  return crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
}

function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!channelSecret || !signature) {
    return false;
  }
  const expected = createLineSignature(rawBody, channelSecret);

  const receivedBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = {
  createLineSignature,
  verifyLineSignature,
};
