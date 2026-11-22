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
| Step 2 Check: Web Risk links, domain age | Frontend built; `checkLinks` function built with tests, not yet deployed; `domainAge` not built |
| Who asked and for how much, from captions (speaker + amount) | Built; the speaker is matched to Directory, so FISHY calls the real person by default |
| Meet and Gmail selectors from Remote Config | Built (`meet_caption_selectors`, `gmail_selectors`) |
| Step 3 Match: known bad accounts, domains, numbers | Built, on device, cached from Firestore |
| Step 4 Call: create check, start call, follow state, escalation countdown | Frontend built; `startVerificationCall` and the Twilio webhooks (`voice`) built with tests, not yet deployed or tried on a real phone; escalation to the next approver not built |
| Shared learning: a "not me" confirmed with the PIN adds to the known-scam list | `reportSuspects` function built with tests; the panel does not call it yet |
| Web approval page and incident report (+ team alerts) | Pages built; `getApproval` and `answerApproval` built with tests, not yet deployed (the panel does not show the link yet); incident, audit and alert functions are stubs |
| Voice check (P1) | Records 10 s of the Meet tab on click (`tabCapture`); `scoreVoice` function not built (demo score without Firebase) |
| Face check (P1) | Screen only |

Function contracts (inputs and outputs) are written above each function in [functions/src/index.ts](functions/src/index.ts). The rules behind them live in `functions/src/call`, `approve`, `learn` and `webrisk`, and are tested without a database or a phone (`npm test`).

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

Requirements: Node 22.18 or newer (CI uses 24), desktop Chrome 139+.

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

### Deploy to Firebase (Google Cloud)

What gets deployed: the rules of FISHY's own Firestore database, the Cloud Functions (Jakarta, `asia-southeast2`) and the web pages in `web/` (Hosting). The extension itself is not deployed: it is loaded from `extension/dist`.

**FISHY can share a Google Cloud project with another app.** Everything it deploys is its own, so a deploy cannot replace the other app's:

| FISHY's own | How |
|---|---|
| Firestore data and rules | a named database, `fishy`. The `(default)` database is never touched |
| Web pages | a Hosting site of its own, named in `.firebaserc` |
| Functions | the `fishy` group (codebase) in `firebase.json` |
| Secrets | `FISHY_TWILIO_ACCOUNT_SID`, `FISHY_TWILIO_AUTH_TOKEN` |
| Remote Config | `npm run remoteconfig` adds FISHY's three parameters and keeps every other one. Never deploy the template file directly: publishing replaces the whole project template |

Three things are still shared by the whole project, so check them with whoever owns the other app first: **Anonymous sign-in** (an app whose rules allow "any signed-in user" would then allow FISHY's anonymous users too), **billing**, and the **Gemini Developer API** being switched on.

**Once per project, in the [Firebase console](https://console.firebase.google.com/)** (these steps need a person and a browser):

1. Create the project, then upgrade it to the **Blaze** plan. Cloud Functions need it. Linking billing also ends the free tier of the Gemini Developer API for that project, so set a budget alert.
2. **Authentication** → Sign-in method → enable **Anonymous**. In a shared project, read the note above first.
3. **AI Logic** → get started with the **Gemini Developer API**.
4. Project settings → add a **Web app**. Its config goes into `extension/.env.local` and `web/.env.local`.
5. **App Check** → register that web app with **reCAPTCHA Enterprise** (the hosted pages use it; the site key goes into `web/.env.local`), and add a **debug token** for the extension (it goes into `extension/.env.local`).

**On the machine that deploys:**

1. Sign in once: `npx firebase-tools login` (on a remote machine add `--no-localhost`). For CI, use a service account through Application Default Credentials; `login:ci` tokens are deprecated.
2. Copy `.firebaserc.example` to `.firebaserc` with your project ID.
3. Create FISHY's database and its Hosting site, and tell the deploy which site is FISHY's. Site IDs are unique across all of Firebase, so pick your own; the pages will be at `https://<site-id>.web.app`.

   ```bash
   npx firebase-tools firestore:databases:create fishy --location=asia-southeast2
   ```

   ```bash
   npx firebase-tools hosting:sites:create your-site-id
   ```

   ```bash
   npx firebase-tools target:apply hosting fishy your-site-id
   ```

4. Copy `functions/.env.example` to `functions/.env.<your-project-id>` and fill it in. Leave `CALLS_ENABLED=false` for now. That file is never committed.
5. Copy `web/.env.example` to `web/.env.local` and fill it in. Without it the web pages build in demo mode.
6. Set the two Twilio secrets (they are stored in Secret Manager, never in a file). They must exist before the first deploy. With no Twilio account yet, enter the word `not-set` for both and leave calls off: checks still start and the approval page still works.

   ```bash
   npx firebase-tools functions:secrets:set FISHY_TWILIO_ACCOUNT_SID
   ```

   ```bash
   npx firebase-tools functions:secrets:set FISHY_TWILIO_AUTH_TOKEN
   ```

7. See what would be deployed. This reads the settings files, names the project, the Hosting site and the database, stops if the web pages would go up in demo mode or a setting is missing, and says out loud when real calls are on:

   ```bash
   npm run deploy:check
   ```

8. Deploy. It runs the same check first, then deploys only FISHY's own pieces:

   ```bash
   npm run deploy
   ```

9. Add the scam rules and page selectors to Remote Config. This step and the next one use Google application default credentials for the project (`gcloud auth application-default login`, or a service account). Look first, then publish:

   ```bash
   npm run remoteconfig -- --dry-run
   ```

   ```bash
   npm run remoteconfig
   ```

10. Load the demo company into Firestore. Phone numbers and the PIN come from the environment, never from a file in this repo. The keys are the IDs in [extension/src/demo/fixtures.ts](extension/src/demo/fixtures.ts). Add `-- --dry-run` first to see what would be written.

   ```bash
   SEED_PROJECT_ID=your-project-id SEED_PHONES='{"budi":"+00000000000"}' SEED_PIN=0000 npm run seed
   ```

11. Try it without a phone: set `APPROVAL_PAGE_ENABLED=true`, deploy again, start a call from the side panel, and open the `approvalUrl` that `startVerificationCall` returns. Answer **No** with the PIN: `checks/{id}.call.state` becomes `not_me`.
12. Try it with a phone: set `CALLS_ENABLED=true` and put your own verified number in `CALL_ALLOWLIST`, then deploy again.

Not yet tried against a real project: this whole section, including whether the Hosting rewrite for `/voice/**` reaches a function in `asia-southeast2`. The Firebase docs list that region for Cloud Run rewrites but do not say so for Functions.

| Setting | What it does | Default |
|---|---|---|
| `PUBLIC_BASE_URL` | The Hosting address. Twilio calls back to `/voice/…` on it, and the approval link starts with it | none, required |
| `CALLS_ENABLED` | Master switch for real calls | `false` |
| `CALL_ALLOWLIST` | The only numbers that may be called, comma-separated. `*` means any number | empty |
| `CALLS_DAILY_CAP` | Most calls per day | `20` |
| `APPROVAL_PAGE_ENABLED` | Web approval page for judges, who cannot receive a trial call. A demo device: the link goes to the person who asked for the check, so keep it off in real use. The PIN is still required | `false` |
| `COMPANY_NAME`, `COMPANY_DOMAIN` | Shown on the approval page; the domain can never be added to the known-scam list | empty |

What the phone menu does: pressing 2 sets `not_me` at once. Pressing 1 confirms nothing until the right PIN follows. Three wrong PINs close the check without confirming it. A `not_me` followed by the right PIN adds the reported account, domain and number to `knownBad`; the company's own domain and its suppliers' domains and accounts can never be added.

### Firestore data

All of it lives in FISHY's own database, `fishy`, not in `(default)`.

| Collection | Who reads it | Fields |
|---|---|---|
| `directory/{id}` | Cloud Functions only | `{ type, name, role, phone, pinSalt, pinHash }` |
| `directoryPublic/{id}` | the side panel | person: `{ type: 'person', name, role, phoneMasked, escalationOrder?, pinSet }` · supplier: `{ type: 'supplier', name, domain, contact: { name, role, phoneMasked }, account: { bank, masked, holder }, paidMonths: string[] }` |
| `knownBad/{kind:value}` | the side panel (cached 1 h) | `{ kind: 'account' \| 'domain' \| 'phone', value, display, count, events?: [{ date, what }] }` (accounts: last 4 digits) |
| `checks/{id}` | owner; `call` written by Functions | `{ ownerUid, createdAt, summary: { flags, patterns, place, amount?, payee? }, call?: { state, personId, placed, pinVerified, reason } }` · `state`: `ringing`, `confirmed`, `not_me` or `no_answer` |
| `checkCalls/{id}`, `checkSuspects/{id}`, `callCounters/{day}` | Cloud Functions only | the full record of each phone check, the reported details of the request, and the daily call count |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Extension with hot reload |
| `npm run build` | Builds extension, web page and functions |
| `npm test` | Extension tests (rules engine, checks, redaction), Cloud Functions tests and seed tests |
| `npm run check` | Type check, tests and build in one go; CI runs the same steps |
| `npm run deploy:check` | Says what a deploy would do and whether it may go ahead |
| `npm run deploy` | The check, then FISHY's rules, functions and web pages to Firebase |
| `npm run remoteconfig` | Adds FISHY's Remote Config parameters, keeping every other one |
| `npm run seed` | Loads the demo company into Firestore (see "Deploy to Firebase") |
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
