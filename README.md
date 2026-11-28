<p align="center"><img src="brand/logo-lockup.svg" alt="FISHY" width="300"></p>

# FISHY: don’t take the bait, make the call

**Is it real?** A Chrome extension that checks a picture, a document, a voice or the video call you are in for signs of AI or tampering, and then phones the real person on a number on record before money moves.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) (Web / Chrome) with **Firebase AI Logic hybrid inference**: Gemini Nano looks at pictures and reads messages on the laptop, and Gemini in the cloud takes over when Nano is not available.

> Built 21–30 Nov 2026 for the submission due 1 Dec 2026, 05:00 WIB (30 Nov, 2:00 PM PT).

## Why it matters

A deepfaked boss on a video call, a cloned voice note, an AI-made receipt or an edited invoice needs no malware, only one person who believes it. In 2024 one employee moved $25.6M after a video call where every other face was fake (Arup, Hong Kong). FISHY lets anyone check before they trust: the file's own marks (Content Credentials, AI labels, the tool that made it), what Gemini sees in the picture or hears in the voice, and then a call to the real person on a number on record, never one from the message. No detector can promise a fake will be caught, so FISHY shows signs, not verdicts, and the call decides. However real the fake looks, it can't answer the real phone.

## Try it

| What | How | Needs |
|---|---|---|
| **Try FISHY in a browser** | Open `/try` on the hosted pages and drop a picture (a photo, an ID, a receipt, a transfer screenshot), or press **Use the sample** for a message. It shows the file's own marks, what Gemini saw, and where each step ran (Gemini Nano on your device, or the cloud) | Nothing to install. App Check runs through reCAPTCHA Enterprise, with no debug token |
| **The approver's page** | Open `/?demo` on the hosted pages: what the real person sees when a phone call can't reach them (yes or no, then a PIN) | Nothing |
| **The extension, demo mode** | Download `fishy-extension-demo.zip` from the release, unzip it, then `chrome://extensions` → Developer mode → **Load unpacked**. It runs on a fictional company; the keyword reader stands in for Gemini and says so | Chrome 139+ |
| **The extension, live** | Build it with your own Firebase project (see [Run it](#run-it)) | A Firebase project with AI Logic and an App Check debug token |

The hosted address and the release are filled in at submission. `npm run package` builds the demo zip; it refuses to package a build that carries a Firebase key.

## How FISHY uses Firebase AI Logic

The hybrid pattern is chosen by what the model is given:

| Task | What the model gets | Mode | Why |
|---|---|---|---|
| **Read** the request for pressure tactics ([tactics.ts](extension/src/lib/ai/tactics.ts)) | The message itself | FISHY checks `LanguageModel.availability()` first: `ONLY_ON_DEVICE` with the raw text when Gemini Nano is ready, otherwise `ONLY_IN_CLOUD` with a **redacted** copy (accounts, numbers, emails and links removed, [redact.ts](extension/src/lib/redact.ts)) | Private message text may only reach Gemini Nano on the laptop. The SDK's automatic fallback would send the raw text to the cloud, so FISHY chooses itself |
| **Look** at a picture or a document's first page for signs of AI or editing ([media.ts](extension/src/lib/ai/media.ts)) | The picture, plus what the laptop measured in it | **Escalation:** `PREFER_ON_DEVICE` first (Gemini Nano on the laptop). Only when Nano can't tell, says it isn't sure, finds a single sign, or finds nothing where the laptop's own checks found something ([escalate.ts](extension/src/lib/ai/escalate.ts)), the same request goes to `ONLY_IN_CLOUD` for a second opinion. Both readings are shown | A clear first look never leaves the laptop; the cloud is spent only where it changes the answer |
| **Compare** frames of the video call for a deepfake face ([media.ts](extension/src/lib/ai/media.ts), [voice.ts](extension/src/lib/voice.ts)) | A numbered sheet of 5 frames over 3 s (8 frames during the hand check), plus the motion measured between them | The same escalation | One image keeps it within what Nano takes, and lets the model compare frames in one look |
| **Listen** to a voice clip for signs of a cloned or spliced voice ([media.ts](extension/src/lib/ai/media.ts)) | 10 seconds of the call, or a recording the person chose, as 16 kHz WAV, plus the voice measurements | `ONLY_IN_CLOUD`, after the on-device measurements ([voice-math.ts](extension/src/lib/forensics/voice-math.ts)) | Firebase AI Logic cannot send audio to Gemini Nano yet; the laptop's measurements are the on-device half |
| **Explain** the red flags in plain words ([explain.ts](extension/src/lib/ai/explain.ts)) | The red flags only (titles and one line of masked evidence), never the message | `PREFER_ON_DEVICE`: Firebase AI Logic runs Nano when it can and falls back to the cloud by itself | Nothing private is in the input, so the SDK may decide |

Both answer in JSON or short text, and `inferenceSource` tells the panel which badge to show: **On device** or **Cloud** on every step. The verdict itself never comes from the model: a fixed rules engine decides it from the signals, so the same signals always give the same verdict. Firebase App Check protects every call (a debug token in the extension, reCAPTCHA Enterprise on the hosted pages), and the same prompts run in the extension and on `/try` ([prompts.ts](extension/src/lib/ai/prompts.ts)).

**Before any model: the laptop's own measurements** ([extension/src/lib/forensics](extension/src/lib/forensics)). They are told to Gemini with the file, so its reading is grounded in numbers, and they count in the score on their own:

| Check | What it finds | Based on |
|---|---|---|
| Camera preview vs picture | The small preview a camera stores no longer matches the picture: changed or cropped after it was taken | Kee & Farid, digital image authentication from thumbnails (SPIE 2010) |
| JPEG quantization tables | A file that names a camera but was last saved with standard software tables | Kornblum, DFRWS 2008 |
| Grid pattern in the noise (PNG, WebP) | The periodic peaks latent-diffusion generators leave at 1/4 and 1/8 of the sampling frequency | Corvi et al., 2023 |
| Motion across frames | A frozen picture: a still photo played as a camera | |
| Hand check | A live face swap breaking up behind a hand (GOTCHA: hand occlusion degraded real-time deepfakes most of all tested challenges) | Mittal et al., GOTCHA |
| Voice | Flat pitch, digitally empty pauses, background jumps between pauses (joined recordings), missing breaths, even pause rhythm; call-app noise filters are allowed for | Layton et al., 2024 (breaths) |

Tested honestly: a re-save heat map (ELA) and a grain check are shown for a person to look at but **not scored**. On clean and forged test pictures with text, they flagged clean pictures as often as forged ones.

**What kind of scam:** the signals are matched to scam patterns from Remote Config (Deepfake executive on a video call, Executive voice clone, Real-time face swap, Fake camera feed, Doctored invoice, Forged document, AI-made picture or receipt, Doctored picture or payment screenshot…), each with what to do. A deployed config adds to the built-in rules, never removes them.

Other Firebase products: **Authentication** (anonymous) for the checks a person owns, **Firestore** for the directory, known scams and call state, **Remote Config** for scam rules and the Meet and Gmail page selectors, **Cloud Functions** for the call, the approval page, the link check, domain age and the incident report, and **Hosting** for the pages.

## Status

| Part | State |
|---|---|
| Check something: pictures, PDFs, voice recordings, the video and the voice of the call in this tab | Built: the file's own marks on the laptop (Content Credentials, IPTC AI label, AI tools, photo editors, PDF edit traces), Gemini's signs for pictures, document pages and video frames (hybrid) and voices (cloud), and the rules that turn them into red flags. Not yet tried with real Gemini |
| Side panel: Verdict, evidence screens, Directory, Check something, Settings | Built; runs on demo data or live input |
| Step 1 Read: Firebase AI Logic hybrid (Nano on device, cloud on redacted text) | Built; needs a Firebase config to call Gemini (offline it falls back to a labelled keyword reader). The cloud request was answered live through Firebase AI Logic with App Check; not yet tried from the side panel or with Nano |
| Step 2 Check: look-alike sender, invoice PDF (account vs record, edit traces) | Built, on device, with tests |
| Step 2 Check: sender authentication (DMARC/SPF/DKIM, webmail reply-to) | Built, read from the opened email's own headers on the laptop |
| Step 2 Check: Web Risk links, domain age | Frontend built; `checkLinks` function built with tests and deployed, not yet tried live; `domainAge` built with tests (RDAP through rdap.org, tried live from a laptop), not yet deployed |
| Who asked and for how much, from captions (speaker + amount) | Built; the speaker is matched to Directory, so FISHY calls the real person by default |
| Meet and Gmail selectors from Remote Config | Built (`meet_caption_selectors`, `gmail_selectors`) |
| Step 3 Match: known bad accounts, domains, numbers | Built, on device, cached from Firestore |
| Step 4 Call: create check, start call, follow state, escalation countdown | Frontend built; `startVerificationCall` and the Twilio webhooks (`voice`) built with tests and deployed, not yet tried on a real phone; with no call placed the panel says so and links the approval page; no answer within 10 minutes (or a call that ends unanswered) starts a new check and calls the next approver on record |
| Shared learning: a "not me" confirmed with the PIN adds to the known-scam list | `reportSuspects` function built with tests; the panel sends the request's accounts, domains and numbers with every call |
| "Why it's fishy": Gemini explains the red flags | `explainVerdict` built with tests: Firebase AI Logic in PREFER_ON_DEVICE mode, on the signals only (never the message); shown on the Verdict screen as "Why this is risky", labelled with where it ran. Without Firebase, a fixed sentence built from the flags stands in and says so. Not yet tried with Nano or the cloud model |
| Web approval page | Built; `getApproval` and `answerApproval` built with tests and deployed; tried live only as far as a made-up link (the page passes App Check and refuses it), a real approval not yet; the panel shows the link |
| Incident report and audit log | Built with tests: after a call ends, the panel copies a report link (7 days; only its hash is stored) for the finance manager; `shareIncident`, `getIncident`, `markIncidentHandled`, `getAuditLog`. Not yet deployed |
| Team push alerts | Not built (`registerAlertToken` is a stub); the incident page does not offer them |
| Try FISHY (`/try`) and a demo extension build | Built: the hosted page runs the tactic reader and the explanation through Firebase AI Logic with reCAPTCHA App Check, no debug token; `npm run package` zips the extension in demo mode. Not yet deployed |
| Voice check (P1) | Records 10 s of the Meet tab on click (`tabCapture`); `scoreVoice` function not built (demo score without Firebase) |
| Face check (P1) | Not built; removed from the panel |

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

Design system: [DESIGN.md](DESIGN.md) (colours, type, components, motion, and how they came from the FISHY deck).

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
| `invoice-sinar-fishy.pdf` | Bank account changed (Bank Teluk •••• 9032, record says Bank Karang •••• 4471), edited 3 days after it was made in an online editor, bank line in another font, known scam account |
| `invoice-sinar-clean.pdf` | Account matches the record, no later edits |

### Gemini Nano on the laptop

1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled, restart Chrome.
2. In DevTools: `await LanguageModel.availability()` should say `available`, `downloadable` or `downloading`.
3. The model downloads after a user click; until then FISHY uses the cloud on redacted text and shows the **Cloud** badge.

### Firebase

- Enable **Firebase AI Logic**, **App Check**, **Authentication** (Anonymous), **Firestore**, **Remote Config**, **Cloud Functions** (Blaze plan).
- App Check: the extension cannot load reCAPTCHA, so it uses a **debug token** (accepted by #BuildHybridAI). Register it under App Check → Apps → Manage debug tokens and put it in `extension/.env.local`. Never commit it.

#### Which Gemini API the cloud model uses

Firebase AI Logic can reach Gemini through two APIs. FISHY works with either: both go through Firebase AI Logic and App Check, and both get redacted text only. They differ in who pays. Choose with `VITE_AI_PROVIDER` in `extension/.env.local`, then build the extension again.

| `VITE_AI_PROVIDER` | Calls | Who pays (Google's rules in November 2026) |
|---|---|---|
| `developer` (when not set) | Gemini Developer API | Nothing on a project **without** billing. On a project **with** billing it needs prepaid credit bought in Google AI Studio (smallest amount $5), and Google Cloud free trial credit cannot pay for it. With no prepaid credit every call is refused (we saw 429, "Your prepayment credits are depleted") |
| `agent-platform` | Gemini on Agent Platform (formerly Vertex AI) | The project's own Cloud Billing account, per use. Needs the Blaze plan. Free trial credit pays for it only on a billing account opened before 16 Nov 2026 that has not been upgraded to a paid account since then |

FISHY's functions need the Blaze plan, so a project that runs all of FISHY has billing: use `agent-platform` there, or buy prepaid credit and keep `developer`. Any other value stops the reader with a message that names the setting. The hosted pages take the same setting: `VITE_AI_PROVIDER` in `web/.env.local` for a deploy from a laptop, and the repository variable `AI_PROVIDER` for a deploy from GitHub. A name that is not one of the two stops that deploy before anything is written. Sources: [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing), [its FAQ on free trial credit](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting), [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing).

### Deploy to Firebase (Google Cloud)

What gets deployed: the rules of FISHY's own Firestore database, the Cloud Functions (Jakarta, `asia-southeast2`) and the web pages in `web/` (Hosting). The extension itself is not deployed: it is loaded from `extension/dist`.

**FISHY can share a Google Cloud project with another app.** Everything it deploys is its own, so a deploy cannot replace the other app's:

| FISHY's own | How |
|---|---|
| Firestore data and rules | a named database, `fishy`. The `(default)` database is never touched |
| Web pages | a Hosting site of its own, named in `.firebaserc` |
| Functions | the `fishy` group (codebase) in `firebase.json` |
| What the functions may reach | they run as an account of their own, `fishy-functions`, which may use the `fishy` database and nothing else |
| Secrets | `FISHY_TWILIO_ACCOUNT_SID`, `FISHY_TWILIO_AUTH_TOKEN` |
| Remote Config | `npm run remoteconfig` adds FISHY's three parameters and keeps every other one. Never deploy the template file directly: publishing replaces the whole project template |

Three things are still shared by the whole project, so check them with whoever owns the other app first: **Anonymous sign-in** (an app whose rules allow "any signed-in user" would then allow FISHY's anonymous users too), **billing**, and **Firebase AI Logic** being switched on (its Gemini APIs, and prepaid Gemini credit, belong to the whole project and its billing account).

**Once per project, in the [Firebase console](https://console.firebase.google.com/)** (these steps need a person and a browser):

1. Create the project, then upgrade it to the **Blaze** plan. Cloud Functions need it. Linking billing also ends the no-cost tier of the Gemini Developer API for that project: see [Which Gemini API the cloud model uses](#which-gemini-api-the-cloud-model-uses). Set a budget alert.
2. **Authentication** → Sign-in method → enable **Anonymous**. In a shared project, read the note above first. On a project that never had sign-in, this also sets the sign-in service up; ours came out as Identity Platform, which is free up to 50,000 monthly users on Blaze and counts anonymous users.
3. **AI Logic** → get started, with the Gemini API you chose above.
4. Project settings → add a **Web app**. Its config goes into `extension/.env.local` and `web/.env.local`.
5. **App Check** → register that web app with **reCAPTCHA Enterprise** (the hosted pages use it; the site key goes into `web/.env.local`), and add a **debug token** for the extension (it goes into `extension/.env.local`).
6. **App Check** → require it (**Enforce**) for **Firebase AI Logic**. The web API key ships inside the extension, so without this anyone who reads it can run Gemini on the project's bill. It took about five minutes to take effect for us.

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

4. Create the account the functions run as, and let it use FISHY's database only. Its full address goes into `RUNTIME_SERVICE_ACCOUNT` in the next step. The functions do not run as the project's default account: another app in the same project may run as that one too.

   ```bash
   gcloud iam service-accounts create fishy-functions --display-name="FISHY functions runtime"
   ```

   ```bash
   gcloud projects add-iam-policy-binding your-project-id --member="serviceAccount:fishy-functions@your-project-id.iam.gserviceaccount.com" --role="roles/datastore.user" --condition='expression=resource.name=="projects/your-project-id/databases/fishy",title=fishy-database-only'
   ```

5. Copy `functions/.env.example` to `functions/.env.<your-project-id>` and fill it in. Leave `CALLS_ENABLED=false` for now. That file is never committed.
6. Copy `web/.env.example` to `web/.env.local` and fill it in. Without it the web pages build in demo mode.
7. Set the two Twilio secrets (they are stored in Secret Manager, never in a file). They must exist before the first deploy. With no Twilio account yet, enter the word `not-set` for both and leave calls off: checks still start and the approval page still works.

   ```bash
   npx firebase-tools functions:secrets:set FISHY_TWILIO_ACCOUNT_SID
   ```

   ```bash
   npx firebase-tools functions:secrets:set FISHY_TWILIO_AUTH_TOKEN
   ```

8. See what would be deployed. This reads the settings files, names the project, the Hosting site, the database and the account the functions run as, stops if the web pages would go up in demo mode or a setting is missing, and says out loud when real calls are on:

   ```bash
   npm run deploy:check
   ```

9. Deploy. It runs the same check first, then deploys only FISHY's own pieces:

   ```bash
   npm run deploy
   ```

   If every function fails with "missing permission on the build service account", the project's default compute account (`<project-number>-compute@developer.gserviceaccount.com`) has no roles. Functions are built as that account. Google's fix is to give it the role `roles/cloudbuild.builds.builder`. In a shared project that role is too wide, because it can read and delete every storage bucket in the project. Give it only what a FISHY build needs, then deploy again. The bucket and the image store below exist once the first deploy has failed:

   ```bash
   gcloud projects add-iam-policy-binding your-project-id --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/logging.logWriter" --condition=None
   ```

   ```bash
   gcloud artifacts repositories add-iam-policy-binding gcf-artifacts --location=asia-southeast2 --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/artifactregistry.writer"
   ```

   ```bash
   gcloud storage buckets add-iam-policy-binding gs://gcf-v2-sources-PROJECT_NUMBER-asia-southeast2 --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/storage.objectViewer"
   ```

   ```bash
   gcloud storage buckets add-iam-policy-binding gs://gcf-v2-uploads-PROJECT_NUMBER.asia-southeast2.cloudfunctions.appspot.com --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/storage.objectViewer"
   ```

   Before giving that account anything, see which services already run as it: `gcloud run services list --format="table(metadata.name,spec.template.spec.serviceAccountName)"`. Whatever it is given, they get too.

10. Add the scam rules and page selectors to Remote Config. This step and the next one use Google application default credentials for the project (`gcloud auth application-default login`, or a service account). Look first, then publish:

   ```bash
   npm run remoteconfig -- --dry-run
   ```

   ```bash
   npm run remoteconfig
   ```

11. Load the demo company into Firestore. Phone numbers and the PIN come from the environment, never from a file in this repo. The keys are the IDs in [extension/src/demo/fixtures.ts](extension/src/demo/fixtures.ts). Add `-- --dry-run` first to see what would be written.

   ```bash
   SEED_PROJECT_ID=your-project-id SEED_PHONES='{"budi":"+00000000000"}' SEED_PIN=0000 npm run seed
   ```

   Running it again is also how to start a rehearsal clean: it clears the PIN lock and the hourly call count of everyone it loads (see "What the phone menu does" below).

12. Try it without a phone: set `APPROVAL_PAGE_ENABLED=true`, deploy again and start a call from the side panel. The panel says that no phone call was placed and shows **Open the approval page**. Answer **No** with the PIN: `checks/{id}.call.state` becomes `not_me`.
13. Try it with a phone: set `CALLS_ENABLED=true` and put your own verified number in `CALL_ALLOWLIST`, then deploy again.

Tried against a real, shared project on 22 Nov 2026: the database rules, all twelve functions and the web pages deploy, and the Hosting rewrite for `/voice/**` does reach a function in `asia-southeast2` (an unsigned request to `/voice/menu` is refused with 403; a callable without App Check is refused with 401). With Anonymous sign-in on and App Check set up: `checkLinks` lets a request in only with both a sign-in and an App Check token (401 without either), the approval page passes App Check in a browser, and Step 1's cloud request is answered through Firebase AI Logic with an App Check token and refused with 401 without one. The answer came from `agent-platform`; `developer` was refused for lack of prepaid credit. Not yet tried there: a whole check from the side panel, an answer on the approval page, and a real phone call.

#### Phone call or approval page

A check is answered in one of two ways. Which one is used is decided by the settings below, never by a button on a screen: nothing can be switched on by a wrong click in front of an audience.

| The approver's number is… | `CALLS_ENABLED` | What happens |
|---|---|---|
| on `CALL_ALLOWLIST` | `true` | A real phone call. Press 1 or 2, then the PIN |
| not on the list, or calls are off | any | No call. With `APPROVAL_PAGE_ENABLED=true` the side panel shows a link to the web approval page, which asks the same two things: yes or no, then the PIN. With the page off, the check ends as "no answer" |

So a demo needs no phone account at all: leave calls off and switch the approval page on. To show a real call as well, put one number you own on the allowlist. Every other person in the directory still goes to the approval page. A closed switch never falls through silently: the panel says that no call was placed, and why.

### Deploy on every merge

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on every push to `main`: type check and tests first, then the same `npm run deploy` as above, then two requests to the live site to see that it answers. It can also be started by hand (Actions → Deploy → Run workflow), which is how a changed setting goes live. Until the setup below is done, it skips the deploy and says so.

It never deploys Remote Config and never loads the demo data. Those stay steps a person runs.

Two things keep a deploy from stopping half-way:

- **A function is replaced only when it changed.** The Firebase CLI compares the code, the settings and the secret versions with what is live, and skips a function that is the same. A merge that touches only the pages or the side panel replaces no function. The deploy command names no function for this reason: the CLI never skips one that is named.
- **Functions that fail are tried again once**, a minute later, by name. A region gives a project only so much CPU, and twelve functions replaced at the same moment, twice within a few minutes, ran into that limit: nine went through and three were left on their previous version.

If the second try fails too, the run fails and prints the command that finishes the job. Run it: the next deploy may not pick those functions up by itself, because it skips a function whose code looks the same as what is live.

**Set up once.** With `gcloud` signed in as an owner of the project, and after the first deploy by hand (the secrets and the `fishy-functions` account must exist):

```bash
PROJECT_ID=your-project-id GITHUB_REPO=owner/name bash scripts/setup-ci.sh
```

The script creates a sign-in pool that accepts only this repository's `main` branch, and a deploy account, `fishy-deployer`. No key is created: GitHub proves to Google Cloud which repository and branch a run belongs to. It ends by printing the three secrets to store.

One step needs a word. The deploy account can deploy functions only when it may act as two accounts that are not FISHY's:

| Account | Why it is needed | When the script stops instead |
|---|---|---|
| App Engine default, `<project>@appspot.gserviceaccount.com` | The Firebase CLI checks it before any functions deploy, even though no FISHY function runs as it | It has any role in the project |
| Default compute, `<number>-compute@developer.gserviceaccount.com` | It builds the functions, and the Firebase CLI has no setting for another build account | It has the Editor or Owner role. `ALLOW_WIDE_BUILD_ACCOUNT=yes` accepts that, for a project that holds nothing but FISHY |

"May act as" means the deploy account can do whatever that account can do, and can replace any service that runs as it. So the script prints both accounts' roles, and the services that run as the default compute account, before it changes anything. Read that list. A service of another app that runs as the default compute account is better moved to an account of its own first.

Then, in the repository: Settings → Secrets and variables → Actions.

| Name | Kind | What it is |
|---|---|---|
| `GCP_PROJECT_ID` | secret | The project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | secret | Printed by the script |
| `GCP_DEPLOY_SA` | secret | The deploy account, printed by the script |
| `HOSTING_SITE` | variable | FISHY's Hosting site ID |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_APP_ID` | variable | From the web app in the Firebase console. Both are public values: they are in the pages anyone can load |
| `FIREBASE_MESSAGING_SENDER_ID`, `RECAPTCHA_ENTERPRISE_KEY`, `FCM_VAPID_KEY` | variable, optional | The rest of `web/.env.example` |
| `AI_PROVIDER` | variable, optional | Which Gemini API the hosted pages call: `developer` or `agent-platform` (see [Which Gemini API the cloud model uses](#which-gemini-api-the-cloud-model-uses)). Written to the web build as `VITE_AI_PROVIDER`. Not set: the pages use the Gemini Developer API |
| `COMPANY_NAME`, `COMPANY_DOMAIN` | variable, optional | As in the settings table below |
| `APPROVAL_PAGE_ENABLED`, `CALLS_ENABLED`, `CALLS_DAILY_CAP` | variable, optional | The switches. Anything but the word `true` is off |
| `CALL_ALLOWLIST`, `TWILIO_FROM` | secret, optional | Phone numbers, so they are secrets |
| `PUBLIC_BASE_URL`, `RUNTIME_SERVICE_ACCOUNT`, `FIREBASE_AUTH_DOMAIN` | variable, optional | Only when they differ from `https://<site>.web.app`, `fishy-functions@<project>…` and `<project>.firebaseapp.com` |

Three things to know before switching it on:

- **Whoever can push to `main` can deploy.** Protect the branch. The deploy account's roles cover the whole project (Google Cloud has no role limited to one Hosting site or one set of functions), so in a shared project a bad merge here could reach the other app's services. It may also act as the App Engine default account and the default compute account: a role someone later gives either of them is a role the deploy account can use.
- **The workflow log is public** when the repository is. The pre-deploy check never prints a phone number there, only how many are on the allowlist.
- **An App Check debug token never goes into the hosted pages.** The workflow has no setting for one.

| Setting | What it does | Default |
|---|---|---|
| `PUBLIC_BASE_URL` | The Hosting address. Twilio calls back to `/voice/…` on it, and the approval link starts with it | none, required |
| `RUNTIME_SERVICE_ACCOUNT` | The full address of the account the functions run as. One of the project's default accounts is refused | none, required |
| `CALLS_ENABLED` | Master switch for real calls | `false` |
| `CALL_ALLOWLIST` | The only numbers that may be called, comma-separated. `*` means any number | empty |
| `CALLS_DAILY_CAP` | Most calls per day | `20` |
| `APPROVAL_PAGE_ENABLED` | Web approval page, for a demo without a phone account and for judges, who cannot receive a trial call. A demo device: the link goes to the person who asked for the check, so keep it off in real use. The PIN is still required | `false` |
| `COMPANY_NAME`, `COMPANY_DOMAIN` | Shown on the approval page; the domain can never be added to the known-scam list | empty |

What the phone menu does: pressing 2 sets `not_me` at once. Pressing 1 confirms nothing until the right PIN follows. Three wrong PINs close the check without confirming it. Five wrong PINs for one person in a day, over any number of checks, lock that person's PIN for a day: the phone and the approval page then say the PIN is locked, and nothing is confirmed. One person can be asked five times an hour. `npm run seed` clears both. A `not_me` followed by the right PIN adds the reported account, domain and number to `knownBad`; the company's own domain and its suppliers' domains and accounts can never be added.

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
| `npm test` | Extension tests (rules engine, checks, redaction), Cloud Functions tests, and the tests of the seed and deploy scripts |
| `npm run check` | Type check, tests and build in one go; CI runs the same steps |
| `npm run deploy:check` | Says what a deploy would do and whether it may go ahead |
| `npm run deploy` | The check, then FISHY's rules, functions and web pages to Firebase. Functions that did not change are skipped, and ones that fail are tried again once. The deploy workflow runs the same command on every merge to `main` |
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

## Built during #BuildHybridAI

FISHY is a new project: the first commit is from 21 Nov 2026, after the submission period opened, and everything in this repository was written between 21 and 30 Nov 2026. The commit history shows each step:

- The side panel, its five evidence screens, Directory and the on-device checks (look-alike sender, sender authentication, invoice bank details and edit traces, known scams)
- Step 1 with Firebase AI Logic hybrid inference, and the explanation of the red flags
- The phone check with Twilio, the PIN, escalation to the next approver and the web approval page
- Shared learning, link checks with Web Risk, domain age through RDAP, and the incident report and audit log
- The hosted Try FISHY page and the demo build of the extension
- The deploy setup that keeps FISHY separate in a shared Google Cloud project

## What we did not write

- Open-source libraries, under their own licenses: React, Vite, `@crxjs/vite-plugin`, the Firebase JS SDK and Admin SDK, `firebase-functions`, pdf.js (`pdfjs-dist`), the Twilio Node library, `@google-cloud/web-risk`, `@resvg/resvg-js`, Vitest, and the Inter, Space Grotesk and JetBrains Mono fonts (Fontsource)
- Services: Gemini through Firebase AI Logic, Google Web Risk, rdap.org for domain registration dates, and Twilio Voice
- The code was written with an AI coding assistant (Claude Code), with Firebase Agent Skills installed
- All people, companies, bank accounts and phone numbers in the demo data are made up

## License

[Apache 2.0](LICENSE)
