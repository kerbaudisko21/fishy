import type { CheckItem } from '../types';

/*
 * Hard evidence in a picture's own bytes, read on the laptop. Nothing is uploaded.
 *
 * What a file can prove about itself:
 *  - Content Credentials (C2PA): a signed record of how the file was made. Many AI generators and
 *    editors now write one, and it can say "made by AI" outright.
 *  - The IPTC "digital source type", the standard label for AI-made media
 *    (trainedAlgorithmicMedia, compositeWithTrainedAlgorithmicMedia).
 *  - The tool that wrote the file (XMP CreatorTool, EXIF Software, PNG text chunks), which names
 *    AI generators and photo editors.
 * What it cannot prove: that a file WITHOUT these marks is real. Messaging apps and screenshots
 * strip them, so their absence is reported as "no marks", never as "authentic".
 */

export interface PictureFacts {
  /** The file says it was made by AI (Content Credentials or the IPTC source type). */
  aiLabel?: string;
  /** Set when an AI generator is named in the file's data. Says what kind of tool, not which one. */
  aiTool?: string;
  /** Set when a photo editor is named in the file's data. Says what kind of tool, not which one. */
  editedWith?: string;
  /** Content Credentials are present (whatever they say). */
  credentials: boolean;
  /** A camera make or model is recorded. */
  camera?: string;
  /** The same facts as rows for the evidence screen. */
  checks: CheckItem[];
}

/**
 * What a match is called on screen. A file's data is matched against product names, but the name
 * itself is not shown: FISHY's screens carry no third-party names. The invoice check does the
 * same when it says "an online PDF editor".
 */
const AI_TOOL = 'an AI image generator';
const EDITOR = 'a photo editor';

/**
 * AI generators, by the names they write into a file.
 * creatorOnly: also an everyday word or a company name, so it counts only in the creator field.
 */
const AI_TOOLS: Array<{ name: RegExp; creatorOnly?: boolean }> = [
  { name: /midjourney/i },
  { name: /dall[·.\- ]?e/i },
  { name: /openai|chatgpt|gpt-4o|gpt-image/i, creatorOnly: true },
  { name: /stable[\s_-]?diffusion|sdxl/i },
  { name: /adobe firefly|\bfirefly\b/i },
  { name: /imagen|gemini|google ai/i, creatorOnly: true },
  { name: /black forest labs|\bflux(?:\.1)?\b/i },
  { name: /leonardo\.ai/i },
  { name: /ideogram/i },
  { name: /comfyui/i },
  { name: /novelai/i },
];

/** Photo editors, by the names they write into a file. */
const EDITORS: RegExp[] = [
  /adobe photoshop/i,
  /lightroom/i,
  /\bgimp\b/i,
  /pixelmator/i,
  /affinity photo/i,
  /snapseed/i,
  /\bcanva\b/i,
  /picsart/i,
  /facetune/i,
  /photopea/i,
  /paint\.net/i,
];

/** The bytes as Latin-1 text, so ASCII markers inside binary data can be searched. Large files: the first and last 4 MB. */
function asText(bytes: Uint8Array): string {
  const LIMIT = 4 * 1024 * 1024;
  const decode = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
  return bytes.length <= LIMIT * 2 ? decode(bytes) : decode(bytes.subarray(0, LIMIT)) + decode(bytes.subarray(bytes.length - LIMIT));
}

/** The value of an XMP or EXIF-like text field, if it appears in plain text in the file. */
function field(text: string, names: string[]): string | undefined {
  for (const name of names) {
    const attr = new RegExp(`${name}\\s*=\\s*"([^"]{1,120})"`, 'i').exec(text);
    if (attr) return attr[1].trim();
    const tag = new RegExp(`<${name}>([^<]{1,120})</${name}>`, 'i').exec(text);
    if (tag) return tag[1].trim();
  }
  return undefined;
}

/** EXIF ASCII strings near a tag are not addressable without a full parser; this looks for tool names anywhere in the text given. */
function named(text: string, names: RegExp[]): boolean {
  return names.some((name) => name.test(text));
}

export function scanPicture(bytes: Uint8Array): PictureFacts {
  const text = asText(bytes);
  const credentials = /c2pa|jumb.{0,40}c2pa|contentauth/i.test(text);
  const sourceType = /compositeWithTrainedAlgorithmicMedia/i.test(text)
    ? 'part made by AI'
    : /trainedAlgorithmicMedia|algorithmicMedia/i.test(text)
      ? 'made by AI'
      : undefined;
  // Stable Diffusion web UIs write their settings into a PNG text chunk called "parameters".
  const sdSettings = /parameters\0[^\0]{0,400}Steps:\s*\d+[^\0]{0,200}Sampler:/i.test(text);

  const creator = field(text, ['xmp:CreatorTool', 'CreatorTool', 'tiff:Software', 'Software']);
  const madeByAi =
    (!!creator && named(creator, AI_TOOLS.map((tool) => tool.name))) ||
    sdSettings ||
    named(text, AI_TOOLS.filter((tool) => !tool.creatorOnly).map((tool) => tool.name));
  const aiTool = madeByAi ? AI_TOOL : undefined;
  const editedWith = (!!creator && named(creator, EDITORS)) || named(text, EDITORS) ? EDITOR : undefined;
  const make = field(text, ['tiff:Make', 'exif:Make']);
  const model = field(text, ['tiff:Model', 'exif:Model']);
  const camera = [make, model].filter(Boolean).join(' ') || undefined;
  const aiLabel = sourceType ? `${credentials ? 'Content Credentials say' : 'The file’s own label says'} it was ${sourceType}` : undefined;

  const checks: CheckItem[] = [];
  if (aiLabel) checks.push({ ok: false, title: 'Labelled as made by AI', detail: aiLabel });
  else if (credentials) checks.push({ ok: true, title: 'Has Content Credentials', detail: 'A record of how it was made, with no AI label. FISHY sees it is there but doesn’t verify its signature, so treat it as a claim' });
  if (aiTool) checks.push({ ok: false, title: `Made with ${aiTool}`, detail: sdSettings ? 'Its generation settings are inside the file' : 'The AI tool is named in the file’s data' });
  if (editedWith) checks.push({ ok: false, title: `Edited in ${editedWith}`, detail: 'Editing is normal for photos, but not for a receipt, an ID or proof of payment' });
  if (!aiLabel && !aiTool && !editedWith && !credentials) {
    checks.push({ ok: true, title: 'No AI or editing marks in the file', detail: camera ? `Camera recorded: ${camera}` : 'No marks usually means it passed through WhatsApp or social media: that alone isn’t evidence either way (NSA/FBI/CISA). No AI watermark found doesn’t mean no AI was used' });
  }
  return { aiLabel, aiTool, editedWith, credentials, camera, checks };
}
