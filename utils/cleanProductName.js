// utils/cleanProductName.js

const FORM_WORDS =
  /\b(TABLETS?|TABS?|TAB|CAPSULES?|CAPS?|CAP|SUSPENSION|INJ|INJECTION|ORAL)\b/gi;

const PACK_PATTERNS = [
  /\(\s*\d+\s*['`"]?\s*S\s*\)/gi,     // (30'S)
  /\b\d+\s*['`"]?\s*S\b/gi,           // 30'S
  /\bPACK\s*OF\s*\d+\b/gi,
  /\b\d+\s*(TAB|TABS|CAP|CAPS)\b/gi
];

export function cleanProductText(raw = "") {
  let text = raw.toUpperCase();

  // Remove pack size
  PACK_PATTERNS.forEach(p => {
    text = text.replace(p, "");
  });

  // Remove formulation words
  text = text.replace(FORM_WORDS, "");

  // Normalize
  text = text
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}
