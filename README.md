<p align="center"><img src="brand/logo-lockup.svg" alt="FISHY" width="300"></p>

# FISHY: is it real?

A Chrome extension that checks what you were sent, and what's open in your tab, for signs of AI or tampering. That covers a picture, a PDF, a voice note, the face and voice on a video call, a website and a QR code. It gives a score, says **why**, and tells you what to do next.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) (Web / Chrome) with **Firebase AI Logic hybrid inference**. Gemini Nano takes the first look on the laptop: fast, private and free. Gemini in the cloud gives a second opinion only when Nano can't tell or isn't sure, and the voice check always uses it.

> Built 21–30 Nov 2026 for the submission due 1 Dec 2026, 05:00 WIB (30 Nov, 2:00 PM PT).

## Why it matters

A deepfaked face on a video call, a cloned voice note, an AI-made receipt, an edited document, a fake website or a QR sticker over a real one needs no malware. It only needs one person who believes it. In 2024 one employee moved $25.6M after a video call where every other face was fake (Arup, Hong Kong).

FISHY lets anyone check before they trust. It looks at:
- the file's own marks;
- the pixels, the voice and the motion, measured on the laptop;
- what Gemini sees or hears.

It then turns them into a score with each reason's weight. No detector catches every fake, so FISHY shows **signs, not proof**, and always ends with the step a fake can't pass: check with the real person another way, on a number you already have.

## Try it

| What | How | Needs |
|---|---|---|
| **Try FISHY in a browser** | Open <https://fishy-check.web.app> and drop a picture (a photo, an ID, a receipt, a transfer screenshot). It shows the file's own marks, what Gemini saw, and where each step ran | Nothing to install. App Check runs through reCAPTCHA Enterprise |
| **The extension** | Download the zip from the release, unzip it, then `chrome://extensions` → Developer mode → **Load unpacked**. Or build it with your own Firebase project (see [Run it](#run-it)) | Chrome 139+ |

`npm run package` builds the shareable zip, and refuses to package a build that carries a Firebase key.

## What it checks

| Check | How you start it | What it looks at |
|---|---|---|
| **Something you were sent** (picture, PDF, voice note) | Drop it, choose it, or right-click a picture on any page | Content Credentials and AI labels; the tool that made it; PDF edit traces; the camera's own preview; JPEG tables and re-saves; copy-move (cloned areas); the grid pattern AI generators leave; QR codes and QRIS payment codes; for voice, pitch, silences, breaths and background; then Gemini |
| **The face on a video call** | "The face", `Alt+Shift+V`, or right-click the video | 9 frames over about 4 s: motion and freezes, then Gemini compares the frames. **Hand check:** 12 frames while the caller passes a hand across their face. **Lip-sync:** does anything move with the voice? **Watch mode:** a check every 20 s, with an alarm only when the evidence adds up |
| **The voice on a call** | "The voice" or `Alt+Shift+A` | 10 s of the call (it stays audible), measured on the laptop, then Gemini listens |
| **The website you're on** | "The website", `Alt+Shift+W`, right-click the page, or a link (address only, never opened) | Look-alike addresses, look-alike letters, abused endings, free hosting asking for passwords, forms and scripts sending elsewhere, the domain's age and Google Web Risk, then Gemini looks at a screenshot |
| **A message** | "Paste a message instead", or right-click selected text | Pressure tactics (urgency, secrecy, authority), with Gemini Nano on the raw text, or the cloud on a redacted copy |

Every result says **what kind of scam it looks like** (from Remote Config), with what to do. The **Scams** tab is a picture guide to the six scam types FISHY spots.

## How FISHY uses Firebase AI Logic

| Task | What the model gets | Mode | Why |
|---|---|---|---|
| **Look** at a picture or a PDF's first page ([media.ts](extension/src/lib/ai/media.ts)) | The picture, plus what the laptop measured in it | **Escalation:** `PREFER_ON_DEVICE` first, with Gemini Nano on the laptop. The same request goes to `ONLY_IN_CLOUD` for a second opinion only when Nano can't tell, isn't sure, finds a single sign, or finds nothing where the laptop's checks found something ([escalate.ts](extension/src/lib/ai/escalate.ts)). Both readings are shown | A clear first look never leaves the laptop |
| **Compare** frames of the video call ([media.ts](extension/src/lib/ai/media.ts), [voice.ts](extension/src/lib/voice.ts)) | One numbered sheet of 9 frames (12 for the hand check), plus the motion between them | The same escalation; watch mode takes one quick look per round | One image stays within what Nano takes, and lets the model compare frames at once |
| **Check the website** in this tab ([site.ts](extension/src/lib/checks/site.ts)) | A screenshot plus the measurements about the address and the page, never the page's text | The same escalation. The cloud lookups get the address only: its age (RDAP) and Google Web Risk | The page may show private details |
| **Listen** to a voice clip | 16 kHz WAV plus the voice measurements | `ONLY_IN_CLOUD`, after the on-device measurements ([voice-math.ts](extension/src/lib/forensics/voice-math.ts)) | Firebase AI Logic can't send audio to Gemini Nano yet; the measurements are the on-device half |
| **Read** a message for pressure ([tactics.ts](extension/src/lib/ai/tactics.ts)) | The message | `ONLY_ON_DEVICE` with the raw text when Nano is ready, otherwise `ONLY_IN_CLOUD` with a **redacted** copy ([redact.ts](extension/src/lib/redact.ts)) | Private text may only reach Gemini Nano on the laptop |

**How the answers are used:**
- Every answer is JSON, and `inferenceSource` drives the badge ("Gemini Nano, on this laptop" or "Gemini, cloud"). Each card also shows the path the check took: laptop checks → Gemini Nano → Gemini cloud.
- Gemini Nano is told to answer in English, as Chrome asks.
- The score never comes from the model: fixed rules weigh the evidence (below).
- Firebase App Check protects every call: a debug token in the extension, reCAPTCHA Enterprise on the hosted page.
- **Other Firebase products:**
  - **Remote Config** for the scam rules and their weights;
  - **Firestore** for reported pictures (fingerprints only) and suppliers on record;
  - **Authentication** (anonymous);
  - **Cloud Functions** for the domain-age and Web Risk lookups;
  - **Hosting** for the page.

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

**How the score is worked out: evidence fusion with likelihood ratios** ([media-score.ts](extension/src/lib/media-score.ts)). The score starts at 15%, an estimate of how often something a person doubts turns out fake. Each sign multiplies the odds by its likelihood ratio: how many times more often it shows up in fakes than in real files. The card shows each sign with its weight ("×8", "÷2"). Signs that tend to come together count less each: the k-th strongest is damped by 0.8^k. The weights are estimates from the research behind each check and from FISHY's own tests, and the card says so.

**Self-tuning escalation** ([stats.ts](extension/src/lib/ai/stats.ts), [escalate.ts](extension/src/lib/ai/escalate.ts)). Every time the cloud gives a second opinion, FISHY notes whether it agreed with Gemini Nano's first look; the counts stay on the laptop. After 8 second opinions:
- if Nano agreed 90% of the time or more, its borderline answers stay on the laptop;
- if it agreed less than 60%, even its "medium" answers are checked.

Settings → How the AI ran shows the share answered on the laptop, the average times, the agreement and the cloud calls saved. The header chip says where the AI runs right now: Gemini Nano, Nano and cloud, cloud only, offline, or laptop checks only.

**Watch mode, with a sequential test** ([sprt.ts](extension/src/lib/forensics/sprt.ts)).
- **Cadence:** one capture of the call stays open. Every 20 s (45 s when Nano isn't available), FISHY grabs 3 frames, blacking its own window out of them, and Gemini takes a quick look.
- **Deciding:** each round's likelihood ratio feeds Wald's SPRT, with α = 1% false alarms and β = 5% missed fakes.
- **Raising the alarm:** it needs the evidence to add up over at least two rounds. Then the cloud double-checks and the result appears as a card.
- **"Looks real so far":** the count restarts and watching goes on.

**Lip-sync** ([lipsync.ts](extension/src/lib/forensics/lipsync.ts)).
- **What it records:** 5 s of the call at 10 frames a second.
- **How it measures:** the motion of each cell of an 8×6 grid is correlated with the voice's loudness, at shifts of ±0.5 s, and the best cell is kept.
- **What counts:** only a mismatch (no cell follows the voice, or a lag over 300 ms). A match is never taken as proof, because some lip-sync fakes match too well.

**QR codes ("quishing")** ([qr.ts](extension/src/lib/forensics/qr.ts)). A QR code in a picture or PDF is read on the laptop:
- **A link** gets the website check's address tests and the cloud lookups (address only).
- **A QRIS / EMVCo payment code** shows who it pays and how much, and its CRC-16 checksum is verified. A code edited to pay someone else fails the checksum.

**Reported before** ([data.ts](extension/src/lib/data.ts)). A picture's 64-bit perceptual hash, never the picture, can be reported as a scam. Each check looks up near matches by the hash's four 16-bit bands (array-contains-any), then by Hamming distance. Firestore rules allow one report per person per picture and accept the hash and nothing else.

**What kind of scam:** the signals are matched to scam patterns from Remote Config (Deepfake on a video call, Cloned voice, Real-time face swap, Fake camera feed, Phishing or fake website, QR code scam, Forged document, AI-made picture or receipt, Doctored picture or payment screenshot…), each with what to do. A deployed config adds to the built-in rules, never removes them.

Other Firebase products: **Authentication** (anonymous) for the checks a person owns, **Firestore** for the directory, known scams and call state, **Remote Config** for scam rules and the Meet and Gmail page selectors, **Cloud Functions** for the call, the approval page, the link check, domain age and the incident report, and **Hosting** for the pages.

## Status

| Part | State |
|---|---|
| Pictures, PDFs and voice notes | Built and tested; the cloud reading was seen working live through Firebase AI Logic |
| The face on a video call (frames, hand check, lip-sync, watch mode) | Built and tested; the frame check reached Gemini in the cloud live. Hand check, lip-sync and watch mode not yet tried on a real call |
| The website, links and QR codes | Built and tested; the domain-age and Web Risk functions are deployed |
| Gemini Nano on the laptop | Confirmed available, with image input, on the development laptop |
| Shortcuts, right-click checks, automatic warnings | Built; not yet tried in a real browser session |
| Reported pictures | Built; rules deployed (prototype, see [SECURITY.md](SECURITY.md)) |

## How it works

1. **Measure on the laptop:** the file's own marks, the pixels, the motion, the voice, the address.
2. **Ask Gemini:** Nano first, and the cloud only when Nano isn't enough. It is told what the laptop measured.
3. **Weigh it:** every sign multiplies the odds by its likelihood ratio, so the same evidence always gives the same score ([media-score.ts](extension/src/lib/media-score.ts)).
4. **Say what to do:** the scam type and its advice, and always: check with the real person another way.

## Repository

```
fishy/
├─ extension/              Chrome extension (Manifest V3, Vite, React, TypeScript)
│  ├─ manifest.config.ts   permissions, shortcuts, right-click items
│  └─ src/
│     ├─ sidepanel/        the panel UI (Check, Scams, results, Settings)
│     ├─ content/          the floating window (Shadow DOM)
│     ├─ background/       service worker: shortcuts, right-click, automatic warnings
│     └─ lib/
│        ├─ ai/            Firebase AI Logic: media, prompts, escalation, stats
│        ├─ forensics/     on-device checks: pictures, JPEG, copy-move, QR, voice, video, lip-sync, SPRT
│        ├─ checks/        file marks, PDF traces, website
│        ├─ rules/         scam patterns + likelihood ratios
│        └─ media-score.ts the score
├─ web/                    the hosted "Try FISHY" page
├─ functions/              Cloud Functions: domain age (RDAP) and Web Risk, nothing else
├─ firestore.rules         reported pictures: fingerprint only, one report per person
└─ remoteconfig.template.json  scam rules and weights
```

Design system: [DESIGN.md](DESIGN.md).

## Run it

Requirements: Node 22.18 or newer (CI uses 24), desktop Chrome 139+.

```bash
npm install
npm run icons            # brand/*.svg → extension and web icons
cp extension/.env.example extension/.env.local   # fill in Firebase config
npm run dev              # builds the extension into extension/dist with hot reload
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`. Click the FISHY icon, or press `Alt+Shift+F`, to open FISHY as a floating window on the page.

Design preview without installing: `npm run build -w extension`, then `npx vite preview extension` and open `/src/sidepanel/index.html` at 400 px wide. The web page runs without a config: `npm run dev -w web`.

### Test invoices

`npm run test-invoices` writes two synthetic invoices into `test-fixtures/`. Drop one onto FISHY.

| File | What FISHY should show |
|---|---|
| `invoice-sinar-fishy.pdf` | Edited 3 days after it was made, in an online editor; one line in another font |
| `invoice-sinar-clean.pdf` | No later edits |

### Gemini Nano on the laptop

1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled, restart Chrome.
2. In DevTools: `await LanguageModel.availability()` should say `available`, `downloadable` or `downloading`.
3. The model downloads after a user click; until then FISHY uses the cloud on redacted text and shows the **Cloud** badge.

### Firebase

- Enable **Firebase AI Logic** (Gemini Developer API), **App Check**, **Authentication** (Get started → Anonymous), the **Cloud Firestore API** with a database named `fishy`, and **Remote Config**. Cloud Functions (for the domain-age and Web Risk lookups) need the Blaze plan; without them the website check skips those two lookups.
- App Check: the extension cannot load reCAPTCHA, so it uses a **debug token** (accepted by #BuildHybridAI). Register it under App Check → Apps → Manage debug tokens and put it in `extension/.env.local`. Never commit it.

#### Which Gemini API the cloud model uses

Firebase AI Logic can reach Gemini through two APIs. FISHY works with either: both go through Firebase AI Logic and App Check, and both get redacted text only. They differ in who pays. Choose with `VITE_AI_PROVIDER` in `extension/.env.local`, then build the extension again.

| `VITE_AI_PROVIDER` | Calls | Who pays (Google's rules in November 2026) |
|---|---|---|
| `developer` (when not set) | Gemini Developer API | Nothing on a project **without** billing. On a project **with** billing it needs prepaid credit bought in Google AI Studio (smallest amount $5), and Google Cloud free trial credit cannot pay for it. With no prepaid credit every call is refused (we saw 429, "Your prepayment credits are depleted") |
| `agent-platform` | Gemini on Agent Platform (formerly Vertex AI) | The project's own Cloud Billing account, per use. Needs the Blaze plan. Free trial credit pays for it only on a billing account opened before 16 Nov 2026 that has not been upgraded to a paid account since then |

FISHY's functions need the Blaze plan, so a project that runs all of FISHY has billing: use `agent-platform` there, or buy prepaid credit and keep `developer`. Any other value stops the reader with a message that names the setting. The hosted pages take the same setting: `VITE_AI_PROVIDER` in `web/.env.local` for a deploy from a laptop, and the repository variable `AI_PROVIDER` for a deploy from GitHub. A name that is not one of the two stops that deploy before anything is written. Sources: [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing), [its FAQ on free trial credit](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting), [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing).

### Deploy to Firebase (Google Cloud)

> Earlier versions of FISHY also phoned an approver (Twilio, a PIN, an approval page). That flow and its functions were removed in 0.9.0. The steps below about Twilio, calls, the approval page and people's phone numbers no longer apply: only `checkLinks` and `domainAge` are deployed now.

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
| `npm run seed` | Loads the demo suppliers and the known-bad list into Firestore (`SEED_PROJECT_ID=… npm run seed`) |
| `npm run typecheck` | TypeScript in all three packages |
| `npm run icons` | Regenerates PNG icons from `brand/` |
| `npm run test-invoices` | Writes the two test invoice PDFs into `test-fixtures/` |

## Privacy

- Everything is measured on the laptop first. A picture, a video frame or a website screenshot goes to the cloud only when Gemini Nano isn't available or isn't sure; a voice clip always does.
- Message text reaches the cloud only redacted (accounts, numbers, emails and links removed).
- For a website or a link, only its address is looked up (no query string, never the page).
- A reported picture is stored as a 64-bit fingerprint, never the picture.
- Captures happen only on a click, a shortcut or a right-click. Automatic website warnings are off until you switch them on, and send nothing.
- Nothing you check is stored; the AI statistics in Settings are counts only, on the laptop.

## Use it without opening FISHY

- **Keyboard shortcuts.** Change them at `chrome://extensions/shortcuts`. A shortcut counts as clicking FISHY on that tab, so the video and voice checks work straight away.
  - `Alt+Shift+F` opens FISHY.
  - `Alt+Shift+W` checks this website.
  - `Alt+Shift+V` checks the face on this call.
  - `Alt+Shift+A` checks the voice.
- **Right-click** "Check … with FISHY" on:
  - a picture;
  - a video (its face);
  - a link (its address only, without opening it);
  - selected text (pressure in a message);
  - the page itself.
- **Warn me about risky websites** (Settings, off by default). Chrome asks once for access to all sites. Each page is then checked on the laptop with the website check's address and page tests, and nothing is sent. The FISHY icon shows `!` on a clearly risky site and `?` on a doubtful one. A clearly risky site also gets a banner with "See why", which runs the full website check, and "Not now".

## Research behind FISHY

FISHY follows what recognised organisations recommend, and its weights come from published figures where they exist.

**What it follows**

| Recommendation | Who | In FISHY |
|---|---|---|
| Hang up and call back on a number you look up yourself; verify account changes on a second channel | FBI IC3 (PSA240911, PSA251219), Singapore SPF/MAS/CSA (Mar 2025), OJK, Australia's ACCC | The core action: "Call the real person on the number on record", never a number from the message |
| A pre-agreed code word, a one-time PIN or "known personal details" | FBI IC3 PSA241203; NSA/FBI/CISA deepfake guidance (2023) | The approval PIN; the code-word prompt on the home screen and after a video check |
| Test liveness during calls; ask questions only the real person can answer | NSA/FBI/CISA; Hong Kong Police after the Arup case; NIST SP 800-63A-4 (active detection) | The hand check (GOTCHA), lip-sync, watch mode |
| Hash the original before analysing; check the source with a reverse image search; read the metadata, knowing stripped metadata often just means a chat app | NSA/FBI/CISA | SHA-256 of every file in Details; Google Lens / TinEye for right-clicked pictures; metadata wording |
| No single red flag is proof; detection tools are early | FinCEN FIN-2024-Alert004; Singapore CSA AD-2024-006; NIST AI 100-4 | Likelihood ratios with the evidence shown; "signs, not proof" on every result |
| Check the payee's name, not only the number | EU Verification of Payee (Oct 2025); Bank Indonesia (QRIS merchant name) | QRIS name check: match, close match or none against suppliers on record |
| Report fast; the bank first | OJK / Indonesia Anti-Scam Centre, ScamShield, Hong Kong ADCC, IC3 | "Already paid, or sent details?" on every result |
| Content Credentials: valid and trusted differ from "present" | C2PA 2.x | FISHY says it sees credentials but doesn't verify their signature |

**Where the weights come from** (in [media-score.ts](extension/src/lib/media-score.ts), each with its source):
- **Gemini as a detector:** likelihood ratio about 3 (Jia et al. 2024). A Gemini "likely AI" alone gives "worth a closer look", not "fishy".
- **The hand check:** 12. Hand occlusion degraded live deepfakes most in GOTCHA (Mittal et al. 2024), but newer tools occlude better.
- **A domain under 30 days old:** 12. Most phishing domains are used within days of registration (Interisle).
- **The most abused web endings:** 8; **cheap new ones:** 3 (Interisle 2025).
- **Look-alike letters alone:** about 1 (only 0.17% of phishing domains, Interisle 2025). They count when they imitate a supplier.
- **One user report:** 5. Only 12–40% of what users report is malicious; three reporters give 20.
- **No published figure, so FISHY's estimate:** the camera preview, copy-move, a frozen video, voice splicing. Copy-move and the JPEG checks were also measured in Chrome on realistic pictures.

**How FISHY's accuracy should be measured** (NIST AI 100-4, ISO/IEC 30107-3, ASVspoof 5). Not done yet; this is the plan.
1. **One decision per kind of check:** picture, PDF, voice, live call, website, QR. Thresholds and weights are frozen before the test set is touched.
2. **The test set:**
   - Real items from the target setting: Indonesian invoices, WhatsApp-recompressed photos, call captures, Bahasa and English voice notes, QRIS stickers.
   - Fakes from several generators, some never seen during development.
   - Copies passed through screenshots, re-saves and re-recordings.
   - A slice made by someone who knows FISHY's checks.
3. **Headline figure:** the share of fakes caught at 1% and 0.1% false alarms, with ROC AUC and EER. Calibration: does "×10" really mean about 10 to 1 (Cllr, a reliability plot)?
4. **The hand check:** report it like ISO 30107-3, with the share of each attack type accepted (APCER) and of real callers rejected (BPCER).
5. **Watch mode:** the time to a decision, and the real error rates against the 1% / 5% it was designed for.
6. **People:** finance staff's accuracy and time with and without FISHY, and how often they actually make the callback.
7. **Publishing:** never one "X% accurate". Give per check "at 1 false alarm in 100, FISHY caught Y% of fakes (95% CI)", name what it misses, and never say "verified real".

## Next: Android

FISHY on Android would be a separate app, not the extension. It would use Kotlin with Firebase AI Logic's Android SDK, and run Gemini Nano on phones that support it. It would take pictures, PDFs and voice notes from the Share menu ("Share → FISHY" from WhatsApp or Gmail), with the same Firebase project, App Check and rules. Android doesn't let apps record calls or read other apps' screens, so the face and voice checks on a live call stay in the browser.

## Built during #BuildHybridAI

FISHY is a new project: the first commit is from 21 Nov 2026, after the submission period opened, and everything here was written between 21 and 30 Nov 2026. The commit history shows each step:

- **The checks:** the file's own marks, PDF traces, the picture checks (camera preview, JPEG tables and re-saves, copy-move, the generator grid pattern), voice measurements, multi-frame video with the hand check, lip-sync and watch mode (a sequential test), and the website, link and QR checks
- **Firebase AI Logic hybrid inference:** Nano first, then a cloud second opinion, tuned by how often they agree
- **Likelihood-ratio scoring**, with weights from published research
- **The interface:** the floating window, the scam guide, shortcuts and right-click checks, and opt-in automatic website warnings
- **Infrastructure:** the hosted Try FISHY page, the deploy setup, security reviews and the edge-case tests

The first version (21–23 Nov) also phoned an approver to confirm payments. That flow was removed from the extension on 29 Nov to focus on checking media and websites.

## What we did not write

- **Open-source libraries,** under their own licenses: React, Vite, `@crxjs/vite-plugin`, the Firebase JS SDK and Admin SDK, `firebase-functions`, pdf.js (`pdfjs-dist`), jsQR (`jsqr`), `@google-cloud/web-risk`, `@resvg/resvg-js`, Vitest, and the Archivo, Atkinson Hyperlegible Next and JetBrains Mono fonts (Fontsource, OFL)
- **Services:** Gemini through Firebase AI Logic, Google Web Risk, and rdap.org for domain registration dates
- **The code** was written with an AI coding assistant (Claude Code), with Firebase Agent Skills installed
- **Demo data:** all people, companies, accounts and numbers in it are made up

## License

[Apache 2.0](LICENSE)
