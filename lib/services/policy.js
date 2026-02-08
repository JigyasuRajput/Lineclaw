function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function computeConfidence(input) {
  const classification = input.classification || {};
  const matches = Array.isArray(input.matches) ? input.matches : [];
  const profile = input.profile;

  let score = Number(classification.confidence || 0.5);

  if (classification.intent === "unknown") {
    score -= 0.15;
  }

  if (classification.intent === "sensitive" || classification.is_sensitive) {
    score = Math.min(score, 0.2);
  }

  if (matches.length > 0) {
    score += Math.min(matches.length, 3) * 0.08;
  } else {
    score -= 0.08;
  }

  if (!profile) {
    score -= 0.05;
  }

  return clamp(score, 0, 1);
}

function decideAction(input) {
  const confidence = Number(input.confidence || 0);
  const thresholds = input.thresholds || { answer: 0.75, clarify: 0.45 };

  if (input.isSensitive || input.intent === "sensitive") {
    return "escalate";
  }

  if (confidence >= thresholds.answer) {
    return "answer";
  }

  if (confidence >= thresholds.clarify && !input.alreadyClarified) {
    return "clarify";
  }

  return "escalate";
}

module.exports = {
  computeConfidence,
  decideAction,
};
