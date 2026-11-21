/**
 * Redaction before anything goes to the cloud model (R7: a PC without Gemini Nano).
 * Removes emails, phone numbers, account numbers and URLs; keeps the wording,
 * which is what the tactic reader needs.
 */
const RULES: Array<[RegExp, string]> = [
  [/https?:\/\/\S+/gi, '[link]'],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/\+?\d[\d\s().-]{7,}\d/g, '[number]'],
  [/\b\d{6,}\b/g, '[number]'],
];

export function redact(text: string): string {
  return RULES.reduce((out, [re, label]) => out.replace(re, label), text);
}
