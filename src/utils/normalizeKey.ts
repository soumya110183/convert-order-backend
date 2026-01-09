export function normalizeKey(text: string = ""): string {
  return text
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/\./g, "")          // remove dots (Box Pack.)
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}