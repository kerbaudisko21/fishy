import type { MediaCheck } from './types';

/*
 * The FISHY score for one checked picture, document, voice, video or website, by evidence fusion
 * with likelihood ratios, the way forensic science weighs evidence:
 *
 *   odds(fake | signs) = odds(fake) × LR₁ × LR₂ × …       score = odds / (1 + odds), as 0–100
 *
 *  - The starting odds (PRIOR) are how often something a person doubts enough to check turns out
 *    to be fake. An estimate.
 *  - Each sign has a likelihood ratio: how many times more often it is seen in fakes than in real
 *    files. Above 1 it raises the odds, below 1 ("Gemini saw no signs") it lowers them. The values
 *    are estimates from the research behind each check and FISHY's own tests, not measured on real
 *    cases, and the card says so.
 *  - Signs are not independent (a cloned voice often has both a flat pitch AND no breaths), so the
 *    k-th strongest supporting sign counts with weight 0.8^k: two signs never count as twice one.
 * The same evidence always gives the same score; the model never makes up a number.
 */

export type ScoreBand = 'high' | 'some' | 'low' | 'pending';

export interface Factor {
  text: string;
  /** Its likelihood ratio, or undefined for a detail that is part of the factor above it. */
  lr?: number;
}

export interface MediaScore {
  /** 0–100, or null while Gemini is still reading and nothing else is known. */
  score: number | null;
  band: ScoreBand;
  /** Why, strongest first, in plain words. */
  reasons: string[];
  /** The same reasons with how much each moved the odds. */
  factors: Factor[];
  /** The starting point, 0–1. */
  prior: number;
}

/** How often a file a person doubts enough to check turns out fake. An estimate. */
export const PRIOR = 0.15;
/** Weight of the k-th strongest supporting sign: correlated signs must not stack up. */
const DAMPING = 0.8;

/**
 * Likelihood ratios for the laptop's own findings, by hint id. Estimates: the strength the
 * research reports for each check, cut down where the check is known to raise false alarms.
 */
export const HINT_LR: Record<string, number> = {
  // pictures
  thumbnail: 8, // estimate: part of the camera signature (Kee & Farid 2011); no tamper TPR/FPR published
  resaved: 2, // Kee & Farid: no editor table matched any of 9,163 camera setups; kept modest (phones and chat apps use scaled IJG tables)
  grid: 5, // estimate: Corvi et al. 2023 peaks are real but vanish with compression; non-JPEG only, absence counts as nothing
  copy_move: 3, // estimate: no real-image FP rate published; measured in FISHY: a logo printed twice is a copy too
  cropped_resaved: 1.5, // measured in Chrome: 2/48 clean false alarms, ~50% caught; cropping and re-saving is common and innocent
  double_jpeg: 1.5, // Barni 2017 lab accuracy is high, but innocent re-saves (chat apps, email) are everywhere
  qr_risky: 6, // scored with the address checks; APWG Q4 2025: 655,673 malicious QR codes in one quarter
  qr_checksum: 10, // rare but strong: sticker scams use valid codes, so a bad CRC means the payload was edited
  qr_name_close: 5, // estimate: a merchant name one or two letters off a supplier on record (look-alike payee)
  qr_redirect: 3, // estimate: QR redirectors and shorteners carry most malicious QR codes (APWG Q4 2025)
  // video
  frozen: 4, // estimate: a still or replayed picture is a real pattern, but network freezes are common
  jump: 2, // estimate
  lipsync: 2.5, // LipForensics-style detectors: AUC 0.53–0.87 across datasets, i.e. LR+ ~1.5–3
  // voice
  background_jump: 3, // estimate: call apps' noise suppression also moves the noise floor
  flat_pitch: 1.8, // reference: people judging cloned voices, LR+ 1.9 (Barrington & Farid 2025)
  no_breaths: 2, // Layton et al. 2024 (long TTS clips, TPR 0.90, 0/32 FP); short calls and breathing clones → 2
  even_pauses: 1.5, // estimate
  empty_silence: 1.1, // call apps' noise suppression produces digital silence in real calls
  // websites
  unsafe: 60, // Google Web Risk; no published false-positive rate, misses are common ("not listed" proves little)
  lookalike: 15, // estimate: a near-copy of a supplier on record
  punycode: 1.2, // Interisle 2025: IDNs are only 0.17% of phishing domains; counts when it imitates a supplier (lookalike)
  form_elsewhere: 6, // estimate
  exfil: 10, // estimate: phishing kits send what is typed to a Telegram bot or webhook (KnowBe4, SonicWall, Cyble)
  brand_mismatch: 5, // estimate: a supplier named in the title on an address that isn't theirs (Phishpedia-style)
  not_https: 4, // phishing 5–18% without https vs 1–5% of normal browsing (APWG/Fortra, Google): LR+ ~2–10
  ip_host: 4, // ~2% of phishing URLs use a bare IP; normal browsing rarely does
  young: 12, // Interisle: 57% of phishing domains used within 14 days of registration; ~2% of domains are that new
  young_months: 2, // estimate: under 6 months
  risky_tld_high: 8, // Interisle 2025: .top ~13×, .bond ~42× their share of registrations (capped)
  risky_tld: 3, // new gTLDs: 11% of registrations, 51% of phishing domains (LR ~4.6)
  free_host: 3, // Interisle 2025: 10 hosting providers carry 89% of subdomain phishing; only with a login or payment form
  long_host: 1.6, // estimate
  // reported before
  reported: 5, // one report: only 12–40% of what users report turns out malicious (Proofpoint and others)
  reported_many: 20, // three or more different people reported it
};

/** Gemini's reading as a likelihood ratio: its assessment, more with each sign it can point to. */
export function geminiLR(assessment: string, signs: number, challenge: boolean): number {
  // GOTCHA (Mittal et al. 2024): hand occlusion degraded live deepfakes most (~91%), but human
  // judges reached AUC 0.886 overall, and newer tools occlude better: 12, not 30.
  if ((assessment === 'likely_ai' || assessment === 'likely_edited') && challenge) return 12;
  // Jia et al. 2024: Gemini as a deepfake detector, TPR 0.45–0.61 at TNR 0.833 → LR+ ≈ 3, LR− ≈ 0.6.
  if (assessment === 'likely_ai') return Math.min(6, 3 * 1.3 ** Math.max(0, signs - 1));
  if (assessment === 'likely_edited') return Math.min(4, 2 * 1.3 ** Math.max(0, signs - 1)); // edits on documents: weaker still
  if (assessment === 'unclear') return 1 + 0.3 * signs;
  return 0.7; // no clear signs (LR− ≈ 0.6, kept conservative: newer generators are harder)
}

export function scoreMedia(item: MediaCheck): MediaScore {
  const facts = item.facts ?? {};
  const factors: Factor[] = [];

  // The label "made by AI" is near-proof; "part made by AI" (an AI edit) counts like an edit.
  if (facts.aiLabel) factors.push({ text: `${facts.aiLabel}.`, lr: /part made by AI/.test(facts.aiLabel) ? 10 : 60 });
  if (facts.aiTool) factors.push({ text: `Made with ${facts.aiTool}, named in the file’s data.`, lr: 30 });

  const g = item.gemini;
  const where = item.kind === 'voice' ? 'heard' : 'saw';
  const details: Factor[] = [];
  if (g) {
    const top = g.signs.slice(0, 3).map((s) => `Gemini ${where}: ${s.sign.replace(/\.$/, '')}${s.where ? ` (${s.where})` : ''}.`);
    const lr = geminiLR(g.assessment, g.signs.length, !!item.challenge);
    const lead =
      top[0] ??
      (g.assessment === 'likely_ai'
        ? `Gemini ${where} signs of AI.`
        : g.assessment === 'likely_edited'
          ? `Gemini ${where} signs of editing.`
          : g.assessment === 'unclear'
            ? `Gemini couldn’t tell from this ${item.kind === 'voice' ? 'clip' : item.kind === 'site' ? 'page' : 'picture'} (too small, quiet or blurry), and found nothing to point at.`
            : `Gemini ${where} no clear signs of AI or editing.`);
    factors.push({ text: lead, lr });
    // The other signs are part of the same reading: shown, not counted again.
    details.push(...top.slice(1).map((text) => ({ text })));
  }

  for (const h of item.forensics?.hints ?? []) factors.push({ text: h.text, lr: HINT_LR[h.id] ?? (h.strength === 2 ? 3 : 1.5) });
  if (facts.editedWith) factors.push({ text: `Edited in ${facts.editedWith}.`, lr: 2 });

  // Nothing known yet: Gemini is still reading and nothing else was found.
  if (!factors.length) {
    if (g === null) {
      const text = item.kind === 'voice' || item.kind === 'frame' || item.kind === 'site' ? 'Gemini didn’t run, and the laptop’s own checks found nothing to point at.' : 'No AI or editing marks in the file; Gemini didn’t run.';
      return { score: null, band: 'pending', reasons: [text], factors: [{ text }], prior: PRIOR };
    }
    return { score: null, band: 'pending', reasons: [], factors: [], prior: PRIOR };
  }

  // Fuse: supporting signs strongest first, each weaker one damped; opposing signs count in full.
  const up = factors.filter((f) => (f.lr ?? 1) >= 1).sort((a, b) => (b.lr ?? 1) - (a.lr ?? 1));
  const down = factors.filter((f) => (f.lr ?? 1) < 1);
  let logOdds = Math.log(PRIOR / (1 - PRIOR));
  up.forEach((f, k) => (logOdds += DAMPING ** k * Math.log(f.lr ?? 1)));
  down.forEach((f) => (logOdds += Math.log(f.lr ?? 1)));
  const p = 1 / (1 + Math.exp(-logOdds));
  const score = Math.max(1, Math.min(99, Math.round(p * 100)));
  const band: ScoreBand = score >= 60 ? 'high' : score >= 25 ? 'some' : 'low';

  // Told in the order that explains the result: what raised it first, unless it came out low.
  const ordered = band === 'low' ? [...down, ...up] : [...up, ...down];
  const leadIndex = ordered.findIndex((f) => f.text.startsWith('Gemini '));
  const withDetails = leadIndex >= 0 ? [...ordered.slice(0, leadIndex + 1), ...details, ...ordered.slice(leadIndex + 1)] : ordered;
  return { score, band, reasons: withDetails.map((f) => f.text), factors: withDetails, prior: PRIOR };
}

/** "×6" for a sign that raised the odds, "÷2" for one that lowered them. */
export function lrLabel(lr: number): string {
  const round = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  return lr >= 1 ? `×${round(lr)}` : `÷${round(1 / lr)}`;
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  high: 'Strong signs of AI or tampering',
  some: 'Some signs: take a closer look',
  low: 'No clear signs found',
  pending: 'Not scored yet',
};

/** The word on the stamp for each band. */
export const STAMP: Record<Exclude<ScoreBand, 'pending'>, string> = { high: 'Fishy', some: 'Suspect', low: 'Looks OK' };

/**
 * The score's reasons as one plain sentence that says WHY: "Fishy because the earrings change shape
 * (left ear), and the light on his face doesn't match the room." At most the two strongest reasons.
 */
export function whySentence(s: MediaScore): string {
  if (s.score === null || !s.reasons.length) return '';
  const clean = (r: string) => {
    // The core clause only: "…, as when separate recordings are joined" and second sentences stay in Why.
    const text = r
      .replace(/^Gemini (saw|heard):?\s*/i, '')
      .split(/(?<=[a-z0-9)”"])\.\s|;\s/)[0]
      .replace(/,\s+(as when|as happens when|which|so)\b.*$/i, '')
      .replace(/\.$/, '');
    // Lower-case the first word to run on in the sentence, but not a name ("Content Credentials").
    const [first, second = ''] = text.split(' ');
    const isName = /^[A-Z]/.test(second) || /^[A-Z]{2,}/.test(first);
    return isName ? text : text.charAt(0).toLowerCase() + text.slice(1);
  };
  const parts = s.reasons.slice(0, 2).map(clean);
  const joined = parts.length > 1 ? `${parts[0]}, and ${parts[1]}` : parts[0];
  if (s.band === 'high') return `Fishy because ${joined}.`;
  if (s.band === 'some') return `Worth a closer look: ${joined}.`;
  // Low, but what is told first raised the odds a little: say it as a small sign, not as "okay because".
  const small = (s.factors[0]?.lr ?? 0) > 1;
  return small ? `Looks okay, with ${parts.length > 1 ? 'small signs' : 'one small sign'}: ${joined}.` : `Looks okay: ${joined}.`;
}
