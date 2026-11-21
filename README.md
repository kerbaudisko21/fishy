<p align="center"><img src="brand/logo-lockup.svg" alt="FISHY" width="300"></p>

# FISHY: don’t take the bait, make the call

A Chrome extension that spots social-engineering scams in Google Meet and Gmail, checks the evidence on your laptop, and phones the real person on a number on record before money moves.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) (Web / Chrome) with **Firebase AI Logic hybrid inference**: Gemini Nano reads private content on the laptop, and Gemini in the cloud takes over (on redacted text) when Nano is not available.

> The build runs 22–30 Nov 2026; submission is due 1 Dec 2026, 05:00 WIB.

## Status

| Part | State |
|---|---|
| Side panel: Verdict, 5 evidence screens, Directory, Check it yourself, Settings | Built; runs on demo data or live input |
| Step 1 Read: Firebase AI Logic hybrid (Nano on device, cloud on redacted text) | Built; needs a Firebase config to call Gemini (offline it falls back to a labelled keyword reader) |
| Step 2 Check: look-alike sender, invoice PDF (account vs record, edit traces) | Built, on device, with tests |
| Step 2 Check: sender authentication (DMARC/SPF/DKIM, webmail reply-to) | Built, read from the opened email's own headers on the laptop |
| Step 2 Check: Web Risk links, domain age | Frontend built; `checkLinks` and `domainAge` functions not built |
| Who asked and for how much, from captions (speaker + amount) | Built; the speaker is matched to Directory, so FISHY calls the real person by default |
| Meet and Gmail selectors from Remote Config | Built (`meet_caption_selectors`, `gmail_selectors`) |
| Step 3 Match: known bad accounts, domains, numbers | Built, on device, cached from Firestore |
| Step 4 Call: create check, start call, follow state, escalation countdown | Frontend built; `startVerificationCall` and the Twilio webhooks not built |
| Web approval page and incident report (+ team alerts) | Built; their functions are stubs |
| Voice check (P1) | Records 10 s of the Meet tab on click (`tabCapture`); `scoreVoice` function not built (demo score without Firebase) |
| Face check (P1) | Screen only |

Function contracts (inputs and outputs) are written above each stub in [functions/src/index.ts](functions/src/index.ts).

## How it works

| Step | What happens | Where it runs |
|---|---|---|
| 1 · Read | Tags urgency, secrecy, authority and skipped approvals in Meet captions and opened emails | Gemini Nano, on device |
| 2 · Check | Sender and lookalike domains, links (Web Risk), invoice bank details vs history, PDF edits; voice/face score on click | On device; cloud for Web Risk and scores |
| 3 · Match | Known bad accounts, domains and numbers; scam patterns from Remote Config | On device |
| 4 · Call | Twilio calls the person on record: press 1 or 2, then a PIN; escalates after 10 minutes | Cloud Functions + Twilio |

The verdict comes from a fixed rules engine ([engine.ts](extension/src/lib/rules/engine.ts)), so the same signals always give the same verdict. The model only produces signals.

## Repository

```
fishy/
├─ extension/              Chrome extension (Manifest V3, Vite, React, TypeScript)
│  ├─ manifest.config.ts   permissions, side panel, content scripts
│  └─ src/
│     ├─ sidepanel/        the side panel UI (Verdict, evidence screens, Directory)
│     ├─ content/          Meet and Gmail readers + the in-page banner (Shadow DOM)
│     ├─ background/       service worker (opens the panel)
│     ├─ lib/
│     │  ├─ firebase.ts    Firebase app, App Check, anonymous Auth
│     │  ├─ ai/tactics.ts  Step 1 with Firebase AI Logic hybrid inference
│     │  ├─ rules/         deterministic verdict + tests
│     │  └─ redact.ts      redaction before anything goes to the cloud
│     ├─ demo/fixtures.ts  synthetic demo company (no real data)
│     └─ styles/           design tokens
├─ web/                    web approval page (Firebase Hosting) for when a call can’t reach the approver
├─ functions/              Cloud Functions: call, phone menu webhooks, approval, Web Risk
├─ brand/                  logo (SVG); `npm run icons` renders the PNG icons
├─ firestore.rules         directory phones and PINs are never readable by clients
└─ remoteconfig.template.json  scam rules and Meet caption selectors
```

Designs: [FISHY · Screen designs](https://claude.ai/artifact/D2neF4bvCTBrrWq8uiohMN).

## Run it

Requirements: Node 22+, desktop Chrome 139+.

```bash
npm install
npm run icons            # brand/*.svg → extension and web icons
cp extension/.env.example extension/.env.local   # fill in Firebase config
npm run dev              # builds the extension into extension/dist with hot reload
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`. Click the FISHY icon to open the side panel. `VITE_DEMO_MODE=true` starts on the synthetic demo company; any live input (captions, an opened email, pasted text, an invoice) switches to a live check. Settings → "Load the demo case" brings it back.

Design preview without installing: `npm run build -w extension`, then `npx vite preview extension` and open `/src/sidepanel/index.html` at 400 px wide. The web pages run on demo data without a config: `npm run dev -w web`, then `/?demo` and `/incident?demo`.

### Test invoices

`npm run test-invoices` writes two synthetic invoices from the demo supplier into `test-fixtures/`. Attach one to an email or drop it into **Check it yourself**.

| File | What FISHY should show |
|---|---|
| `invoice-sinar-fishy.pdf` | Bank account changed (Mandiri •••• 9032, record says BCA •••• 4471), edited 3 days after it was made in an online editor, bank line in another font, known scam account |
| `invoice-sinar-clean.pdf` | Account matches the record, no later edits |

### Gemini Nano on the laptop

1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled, restart Chrome.
2. In DevTools: `await LanguageModel.availability()` should say `available`, `downloadable` or `downloading`.
3. The model downloads after a user click; until then FISHY uses the cloud on redacted text and shows the **Cloud** badge.

### Firebase

- Enable **Firebase AI Logic** (Gemini Developer API), **App Check**, **Authentication** (Anonymous), **Firestore**, **Remote Config**, **Cloud Functions** (Blaze plan).
- App Check: the extension cannot load reCAPTCHA, so it uses a **debug token** (accepted by #BuildHybridAI). Register it under App Check → Apps → Manage debug tokens and put it in `extension/.env.local`. Never commit it.
- Copy `.firebaserc.example` to `.firebaserc` with your project id.

### Firestore data

| Collection | Who reads it | Fields |
|---|---|---|
| `directory/{id}` | Cloud Functions only | full phone, PIN hash |
| `directoryPublic/{id}` | the side panel | person: `{ type: 'person', name, role, phoneMasked, escalationOrder?, pinSet }` · supplier: `{ type: 'supplier', name, domain, contact: { name, role, phoneMasked }, account: { bank, masked, holder }, paidMonths: string[] }` |
| `knownBad/{id}` | the side panel (cached 1 h) | `{ kind: 'account' \| 'domain' \| 'phone', value, display, count, events?: [{ date, what }] }` (accounts: last 4 digits) |
| `checks/{id}` | owner; `call` written by Functions | `{ ownerUid, createdAt, summary: { flags, patterns, place, amount?, payee? }, call?: { state, escalateAt?, escalatedTo? } }` |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Extension with hot reload |
| `npm run build` | Builds extension, web page and functions |
| `npm test` | Rules engine and redaction tests |
| `npm run typecheck` | TypeScript in all three packages |
| `npm run icons` | Regenerates PNG icons from `brand/` |
| `npm run test-invoices` | Writes the two test invoice PDFs into `test-fixtures/` |

## Privacy

- Message text is read by Gemini Nano on the laptop and is never stored.
- Without Nano, only redacted text goes to the cloud model; the badge says so.
- Voice clips and video frames leave the laptop only when the user clicks.
- FISHY never calls a number taken from a message.
- The team sees a summary, never the message.

## License

[Apache 2.0](LICENSE)
