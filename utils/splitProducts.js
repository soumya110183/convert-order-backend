const FORM_WORDS =
  /\b(TABLETS?|TABS?|TAB|CAPSULES?|CAPS?|CAP|INJ|INJECTION|SYRUP|SUSPENSION|DROPS?|CREAM|GEL|SPRAY)\b/gi;

const VARIANTS = [
  "FORTE","PLUS","TRIO","CV","CT","MT","DM","GM",
  "SR","XR","CR","OD","ER","HS","XL","AM","H"
];

export function splitProduct(raw = "") {
  if (!raw) return { name: "", strength: "", variant: "" };

  let text = raw.toUpperCase();

  /* remove pack info ONLY */
  text = text.replace(/\(\s*\d+\s*['`"]?\s*S\s*\)/gi, " ");

  /* remove form words */
  text = text.replace(FORM_WORDS, " ");

  /* normalize */
  text = text.replace(/[-–]/g, " ").replace(/\s+/g, " ").trim();

  let strength = "";
  let variant = "";

  /* combo dosage (100/10 etc) */
  const combo = text.match(/\b\d+(\.\d+)?\/\d+(\.\d+)?\b/);
  if (combo) {
    strength = combo[0];
    text = text.replace(combo[0], " ");
  }

  /* unit dosage (MG, GM) */
  if (!strength) {
    const unit = text.match(/\b\d+(\.\d+)?\s*(MG|GM|MCG|IU)\b/);
    if (unit) {
      strength = unit[0].replace(/\s+/g, "");
      text = text.replace(unit[0], " ");
    }
  }

  /* plain numeric strength (650, 250, 1000) */
  if (!strength) {
    const num = text.match(/\b\d+(\.\d+)?\b/);
    if (num) {
      strength = num[0];
      text = text.replace(num[0], " ");
    }
  }

  /* extract variant */
  for (const v of VARIANTS) {
    const r = new RegExp(`\\b${v}\\b`);
    if (r.test(text)) {
      variant = v;
      text = text.replace(r, " ");
      break;
    }
  }

  const name = text.replace(/\s+/g, " ").trim();

  return { name, strength, variant };
}
