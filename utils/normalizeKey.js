
export function normalizeKey(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[_\-]/g, " ")        // _ and - → space
    .replace(/[^a-z0-9 ]/g, "")    // remove symbols
    .replace(/\s+/g, " ");         // collapse spaces
}