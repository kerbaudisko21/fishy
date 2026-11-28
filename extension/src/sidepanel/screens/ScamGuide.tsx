import type { ReactNode } from 'react';
import { Icon } from '../components';

/*
 * The scams FISHY spots, each with a picture, how it works, the signs, and what to do.
 * Pictures are drawn geometry in one stroke weight (like large icons), not illustrations.
 * A scam the current checks point to is marked "Seen in your checks".
 */

const S = { stroke: 'currentColor', strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const CORAL = 'var(--brand)';

const Art: Record<string, ReactNode> = {
  call: (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <rect x="8" y="12" width="56" height="40" rx="6" {...S} />
      <circle cx="36" cy="28" r="8" {...S} />
      <path d="M22 50c2-8 8-12 14-12s12 4 14 12" {...S} />
      <path d="M27 21c3-5 15-5 18 0" stroke={CORAL} strokeWidth="2.4" fill="none" strokeDasharray="3 3" strokeLinecap="round" />
      <path d="M28 60h16M36 52v8" {...S} />
    </svg>
  ),
  voice: (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <rect x="22" y="8" width="28" height="56" rx="6" {...S} />
      <path d="M30 30v12M35 26v20M40 32v8" {...S} />
      <path d="M45 24v24" stroke={CORAL} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M32 14h8" {...S} />
    </svg>
  ),
  site: (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <rect x="8" y="12" width="56" height="46" rx="6" {...S} />
      <path d="M8 24h56" {...S} />
      <rect x="18" y="16" width="36" height="5" rx="2.5" fill={CORAL} />
      <rect x="22" y="32" width="28" height="7" rx="2" {...S} />
      <rect x="22" y="43" width="28" height="7" rx="2" {...S} />
    </svg>
  ),
  qr: (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <rect x="10" y="10" width="52" height="52" rx="4" {...S} />
      <rect x="16" y="16" width="12" height="12" rx="1" {...S} />
      <rect x="44" y="16" width="12" height="12" rx="1" {...S} />
      <rect x="16" y="44" width="12" height="12" rx="1" {...S} />
      <path d="M34 18v6M34 30h6M40 36v4" {...S} />
      <rect x="36" y="38" width="22" height="22" rx="3" fill={CORAL} transform="rotate(-8 47 49)" />
    </svg>
  ),
  invoice: (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <path d="M16 8h28l12 12v44H16z" {...S} />
      <path d="M44 8v12h12" {...S} />
      <path d="M24 30h20M24 38h24" {...S} />
      <rect x="22" y="45" width="28" height="9" rx="2" fill={CORAL} />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <path d="M18 8h36v56l-6-4-6 4-6-4-6 4-6-4-6 4z" {...S} />
      <path d="M26 22h20M26 30h14" {...S} />
      <path d="M27 42l5 5 10-10" {...S} />
      <path d="M54 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={CORAL} />
    </svg>
  ),
};

export interface Scam {
  id: keyof typeof Art;
  name: string;
  how: string;
  signs: string[];
  check: string;
  act: string;
  /** Scam patterns (rules engine) that mean this one. */
  patterns: string[];
}

export const SCAMS: Scam[] = [
  {
    id: 'call',
    name: 'Deepfake on a video call',
    how: 'A familiar face on a call asks for something urgent and secret. The face is generated live from public videos.',
    signs: ['Edges of the face blur or flicker', 'Earrings, glasses or teeth change shape', 'The face breaks up when a hand passes in front'],
    check: 'The face, then the hand check',
    act: 'Leave the call. Call back on the number on record.',
    patterns: ['Deepfake on a video call, with pressure', 'Deepfake video call', 'Real-time face swap', 'Fake camera feed'],
  },
  {
    id: 'voice',
    name: 'Cloned voice',
    how: 'A few seconds of someone’s voice is enough to clone it for a call or a voice note.',
    signs: ['Flat, even rhythm', 'No breathing', 'Background that jumps between sentences'],
    check: 'The voice, or drop the voice note',
    act: 'Ask your agreed code word. Call back on the number on record.',
    patterns: ['Cloned voice, with pressure', 'Cloned voice'],
  },
  {
    id: 'site',
    name: 'Fake website',
    how: 'A copy of a real company’s page, on an address that is one letter off.',
    signs: ['Address close to, but not, the real one', 'Brand-new address', 'Asks for a password, card or code'],
    check: 'The website, or right-click a link',
    act: 'Don’t type anything. Type the real address yourself.',
    patterns: ['Phishing or fake website', 'Fake website copying a supplier'],
  },
  {
    id: 'qr',
    name: 'QR code scam',
    how: 'A sticker over a real QRIS code, or a QR on an invoice, pays someone else or opens a fake page.',
    signs: ['Merchant name you don’t expect', 'Link through a redirect service', 'Code edited (wrong checksum)'],
    check: 'Drop a picture or PDF with the code',
    act: 'Check the merchant name before paying.',
    patterns: ['QR code scam (quishing)'],
  },
  {
    id: 'invoice',
    name: 'Doctored document',
    how: 'A real invoice, letter or ID with one detail changed, or a fake made to look official.',
    signs: ['Edited after it was made', 'One part looks pasted in', 'Made with an AI or editing tool'],
    check: 'Drop the PDF',
    act: 'Ask the sender for the original, and confirm another way.',
    patterns: ['Doctored invoice', 'Forged document'],
  },
  {
    id: 'receipt',
    name: 'Fake payment proof',
    how: 'A transfer screenshot or receipt, edited or made by AI, “proving” you were paid.',
    signs: ['Made by an AI image tool', 'One number looks pasted in', 'Reported by others before'],
    check: 'Drop the picture, or right-click it',
    act: 'Check your own account, never the picture.',
    patterns: ['AI-made picture or receipt', 'Doctored picture or payment screenshot', 'A known scam picture'],
  },
];

export function ScamGuide({ seen = [] }: { seen?: string[] }) {
  return (
    <main className="main">
      <header className="guide-head">
        <h1>Scams FISHY spots</h1>
        <p className="row-detail">What each one looks like, and what to do.</p>
      </header>
      <ul className="guide">
        {SCAMS.map((s) => {
          const hit = s.patterns.some((p) => seen.includes(p));
          return (
            <li key={s.id} className={`guide-card surface${hit ? ' hit' : ''}`}>
              <div className="guide-top">
                <span className="guide-art">{Art[s.id]}</span>
                <span className="grow">
                  <h2 className="guide-name">
                    {s.name}
                    {hit && <span className="guide-hit">Seen in your checks</span>}
                  </h2>
                  <p className="guide-how">{s.how}</p>
                </span>
              </div>
              <ul className="guide-signs" aria-label="Signs">
                {s.signs.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <div className="guide-foot">
                <span className="guide-check">
                  {Icon.check(13)} {s.check}
                </span>
                <span className="guide-act">
                  {Icon.phone(13)} {s.act}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
