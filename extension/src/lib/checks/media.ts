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
  /** An AI generator named in the file's data. */
  aiTool?: string;
  /** A photo editor named in the file's data. */
  editedWith?: string;
  /** Content Credentials are present (whatever they say). */
  credentials: boolean;
  /** A camera make or model is recorded. */
  camera?: string;
  /** The same facts as rows for the evidence screen. */
  checks: CheckItem[];
}

const AI_TOOLS: Array<[RegExp, string]> = [
  [/midjourney/i, 'Midjourney'],
  [/dall[·.\- ]?e/i, 'DALL·E'],
  [/openai|chatgpt|gpt-4o|gpt-image/i, 'OpenAI'],
  [/stable[\s_-]?diffusion|sdxl/i, 'Stable Diffusion'],
  [/adobe firefly|\bfirefly\b/i, 'Adobe Firefly'],
  [/imagen|gemini|google ai/i, 'Google Imagen or Gemini'],
  [/black forest labs|\bflux(?:\.1)?\b/i, 'FLUX'],
  [/leonardo\.ai/i, 'Leonardo.Ai'],
  [/ideogram/i, 'Ideogram'],
  [/comfyui/i, 'ComfyUI'],
  [/novelai/i, 'NovelAI'],
];

const EDITORS: Array<[RegExp, string]> = [
  [/adobe photoshop/i, 'Photoshop'],
  [/lightroom/i, 'Lightroom'],
  [/\bgimp\b/i, 'GIMP'],
  [/pixelmator/i, 'Pixelmator'],
  [/affinity photo/i, 'Affinity Photo'],
  [/snapseed/i, 'Snapseed'],
  [/\bcanva\b/i, 'Canva'],
  [/picsart/i, 'Picsart'],
  [/facetune/i, 'Facetune'],
  [/photopea/i, 'Photopea'],
  [/paint\.net/i, 'Paint.NET'],
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

/** EXIF ASCII strings near a tag are not addressable without a full parser; this finds tool names anywhere in the file. */
function findTool(text: string, list: Array<[RegExp, string]>): string | undefined {
  return list.find(([re]) => re.test(text))?.[1];
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
  const aiTool = (creator && findTool(creator, AI_TOOLS)) ?? (sdSettings ? 'Stable Diffusion' : findTool(text, AI_TOOLS.filter(([, n]) => n !== 'Google Imagen or Gemini' && n !== 'OpenAI')));
  const editedWith = (creator && findTool(creator, EDITORS)) ?? findTool(text, EDITORS);
  const make = field(text, ['tiff:Make', 'exif:Make']);
  const model = field(text, ['tiff:Model', 'exif:Model']);
  const camera = [make, model].filter(Boolean).join(' ') || undefined;
  const aiLabel = sourceType ? `${credentials ? 'Content Credentials say' : 'The file’s own label says'} it was ${sourceType}` : undefined;

  const checks: CheckItem[] = [];
  if (aiLabel) checks.push({ ok: false, title: 'Labelled as made by AI', detail: aiLabel });
  else if (credentials) checks.push({ ok: true, title: 'Has Content Credentials', detail: 'A signed record of how it was made, with no AI label' });
  if (aiTool) checks.push({ ok: false, title: `Made with ${aiTool}`, detail: sdSettings ? 'Its generation settings are inside the file' : 'The AI tool is named in the file’s data' });
  if (editedWith) checks.push({ ok: false, title: `Edited in ${editedWith}`, detail: 'Editing is normal for photos, but not for a receipt, an ID or proof of payment' });
  if (!aiLabel && !aiTool && !editedWith && !credentials) {
    checks.push({ ok: true, title: 'No AI or editing marks in the file', detail: camera ? `Camera recorded: ${camera}` : 'Marks are often removed by chat apps and screenshots, so this alone proves nothing' });
  }
  return { aiLabel, aiTool, editedWith, credentials, camera, checks };
}
