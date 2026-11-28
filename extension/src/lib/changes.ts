// What changed in each version, newest first. Shown in Settings → About ("What's new") and kept
// in step with CHANGELOG.md. Add an entry with every version bump.

export interface Change {
  version: string;
  date: string;
  items: string[];
}

export const CHANGES: Change[] = [
  {
    version: '1.0.0',
    date: '29 Nov 2026',
    items: [
      'A new look, the evidence tag: manila paper, black ink and one evidence red; condensed heavy Archivo for headings, labels and the stamp; square-ish paper tags instead of soft rounded cards',
      'A new logo: a red evidence tag with a fish hook bent into a question mark',
      'The home is just what FISHY can check: drop a picture, PDF or voice note, then four tiles (Face on a call, Voice on a call, This website, A message) and the watch switch. No numbered steps',
      'Fixed: “Directory: Missing or insufficient permissions”. The database rules are published to the project the extension uses, and the supplier list now loads quietly in the background (every check works without it)',
      'The calling, approval, incident and alert functions are removed from the backend and the live project; only the website check’s two lookups remain',
    ],
  },
  {
    version: '0.9.0',
    date: '29 Nov 2026',
    items: [
      'FISHY is now about checking, not payments: the payment card, calling a person with a PIN, “Hold the payment”, the incident report and the Meet and Gmail page scripts are gone (two fewer Chrome permissions)',
      'Gemini points at what looks wrong: numbered boxes on the picture, the website screenshot or the video frame, with the same numbers on the reasons',
      'The video check takes 9 frames over about 4 seconds (12 for the hand check) instead of 5',
      '“Why this is risky” is gone from results (each card already says why); Gemini is told never to name or guess a specific AI model',
      'Shorter advice under results: “Signs, not proof. Before money moves, call them back on the number you have.”, and a short “Already paid?”',
      'PDF checks no longer compare bank accounts; the scam guide and scam names no longer mention executives or suppliers’ accounts',
      'README rewritten for what FISHY is now',
    ],
  },
  {
    version: '0.8.1',
    date: '29 Nov 2026',
    items: [
      'Simpler home: about half the words; the three buttons say just “Deepfake?”, “Cloned?”, “Scam site?”; the shortcut tips moved to Settings',
      'The Directory tab is now “Scams”: a picture guide to the six scams FISHY spots (deepfake boss on a call, cloned voice, fake website, QR code scam, doctored invoice, fake payment proof), each with its signs, which check to use and what to do; a scam your checks matched is marked',
      'No “Call … on record” bar when nobody is on record',
    ],
  },
  {
    version: '0.8.0',
    date: '29 Nov 2026',
    items: [
      'Use FISHY without opening it first: keyboard shortcuts Alt+Shift+F (open FISHY), Alt+Shift+W (check this website), Alt+Shift+V (check the face on this call), Alt+Shift+A (check the voice); change them at chrome://extensions/shortcuts',
      'Right-click anything to check it: a picture, a video (its face), a link (checked by its address, without opening it), selected text (pressure in a message) or the page itself',
      'Warn me about risky websites (off until you switch it on in Settings): each site you open is checked on this laptop, nothing is sent; the FISHY icon shows “!” or “?”, and a clearly risky site gets a banner with “See why” and “Not now”',
      'Settings → Without opening FISHY lists your shortcuts and the switch for automatic warnings',
    ],
  },
  {
    version: '0.7.1',
    date: '29 Nov 2026',
    items: [
      'Fixed: the home screen now follows the strongest check, so it never says “not enough to call it fake” above a red score',
      'Fixed: “Don’t pay until them confirms” now reads “until the real person confirms” (the 0.6.0 fix had not landed)',
      '“Looks like” is one heading with a small coral mark; watch mode is a switch instead of a dashed box that looked like a drop zone',
      '“Fishy because…” keeps to the core of each reason; “How is this scored?” opens the explanation only when asked',
      'Frames that didn’t change are greyed out in the filmstrip; drawn chevrons between the steps of how a check ran; What’s new in Settings is folded',
      'Accessibility: the watch switch’s track now meets the 3:1 contrast rule for controls; themed scrollbar and caret',
    ],
  },
  {
    version: '0.7.0',
    date: '29 Nov 2026',
    items: [
      'Score by evidence fusion: odds × each sign’s likelihood ratio, shown on every reason (“×8”, “÷1.4”), with the weights grounded in published figures (Jia 2024, GOTCHA, Interisle 2025, APWG, Layton 2024) and the rest marked as estimates',
      'Gemini Nano status in the header: Nano + cloud, cloud only, Nano getting ready, offline, or laptop checks only',
      'Self-tuning escalation: FISHY counts how often the cloud agrees with Gemini Nano and asks it less, or more, accordingly; Settings → How the AI ran shows the share answered on this laptop, times, agreement and cloud calls saved',
      'Right-click any picture → “Check this picture with FISHY” (web pages, Gmail, WhatsApp Web), with Google Lens and TinEye for a reverse search',
      'QR codes in pictures and PDFs: where the link goes (address checks, redirectors), and QRIS payment codes: who they pay, the amount, a checksum check and a name check against suppliers on record',
      'Watch mode: checks the call’s face every 20 s on this laptop and raises the alarm only when the evidence adds up (Wald’s sequential test, 1% false alarms), then the cloud double-checks',
      'Lip-sync check: 5 s of the call; does anything on screen move with the voice?',
      'New picture checks: copy-move (two identical areas, outlined), and JPEG saved twice or cropped and re-saved; each tested in Chrome and counted only as weak signs',
      'Reported before: a picture’s fingerprint (never the picture) can be reported as a scam, and later checks show “reported by N users”',
      'Website check: the most abused endings, free hosting asking for passwords, pages sending to chat bots, a supplier’s name on someone else’s address; private network addresses no longer count',
      'Advice from the FBI, CISA, FinCEN, Hong Kong Police and Bank Indonesia on the cards: the code word, “signs, not proof”, the SHA-256 fingerprint of each file, and where to report if money already moved',
    ],
  },
  {
    version: '0.6.1',
    date: '28 Nov 2026',
    items: [
      'Security review (OWASP Top 10 and the LLM Top 10): a website’s title is quoted to Gemini cleaned and labelled, never as instructions; oversized pictures (decompression bombs) and hours-long recordings are refused before they are decoded; Remote Config and model answers are checked field by field',
      'A damaged picture, an empty file or an SVG drawing now says so plainly instead of showing an empty result',
      'Long file names and addresses take two lines at most (the full name on hover)',
      '22 new edge-case tests: random and truncated files, silence, broken samples, black video, hostile page titles, broken model answers and broken Remote Config',
    ],
  },
  {
    version: '0.6.0',
    date: '28 Nov 2026',
    items: [
      'Fourth check: the website in this tab. The laptop reads the address and the page (look-alike letters, a copy of a supplier’s address, a bare number, secrets asked without https or sent to another site, risky endings); the cloud is asked only the address’s age and whether Google lists it as unsafe; Gemini looks at a screenshot, on the laptop first',
      'New scam types: Fake website copying a supplier, Phishing or fake website',
      'FISHY always starts empty: the demo case no longer opens by itself, and the demo buttons are gone',
      'Fixed: “Don’t pay until them confirms” now reads “until the real person confirms” when no one is on record yet',
    ],
  },
  {
    version: '0.5.0',
    date: '28 Nov 2026',
    items: [
      'Home says what to do at a glance: 1 something you were sent, 2 the call you are in (the face, the voice), 3 then call the real person',
      'Hybrid by design: Gemini Nano takes the first look on the laptop; FISHY asks the cloud model for a second opinion only when Nano can’t tell, isn’t sure, finds one sign, or disagrees with the laptop’s own checks. The card shows the path it took',
      'The video check watches 3 seconds (5 frames) instead of one: it spots a frozen picture (a still photo played as a camera) and Gemini compares the frames side by side',
      'New hand check for a video call: ask the caller to pass a hand across their face; a live face swap often breaks up behind the hand',
      'Voice measurements on the laptop before Gemini listens: pitch movement (with a chart), room sound between words, background jumps between pauses, breaths and pause rhythm',
      'Picture checks on the laptop: the camera’s stored preview against the picture, camera files re-saved by software (JPEG tables), and the grid pattern AI generators leave; a re-save heat map to look at yourself',
      'What the laptop measured goes to Gemini with the file, so its reading is grounded in numbers',
      '“Looks like”: what kind of scam the checks point to (deepfake executive on a video call, cloned voice, real-time face swap, fake camera feed, doctored picture or payment screenshot, forged document…), with what to do',
      'Fixed: Remote Config’s scam rules now add to the built-in rules instead of replacing them, so an older config can’t switch the media checks off',
      'The test-data switch in development builds stays hidden unless ?data= is in the address',
      'When the Firebase AI Logic API is off in the project, the card says which API to turn on',
      'Gemini Nano is told to answer in English, as Chrome asks, so it can check the answer’s quality and safety',
    ],
  },
  {
    version: '0.4.0',
    date: '23 Nov 2026',
    items: [
      'New Scanner layout: one big drop zone, three big buttons (Video, Voice, Message), and a list of your checks with their scores',
      'Every result says why in one sentence (“Fishy because…”), with a score ring that fills and counts up',
      'An ink stamp on each result: FISHY, SUSPECT or LOOKS OK',
      'A line sweeps over the picture while Gemini looks; Why and Details fold open and shut',
      'Drop a file anywhere on FISHY to check it',
      'Fixed: the call stays audible while the voice is recorded in the floating window',
      'Gemini errors now say what to do (for example: switch on AI Logic in the Firebase console)',
    ],
  },
  {
    version: '0.3.2',
    date: '23 Nov 2026',
    items: [
      'FISHY opens as a floating window on top of the page: drag it, minimise it, click the icon again to close it',
      'The page is no longer squeezed by a side panel (the side panel is still in Chrome’s side panel menu)',
      'While checking the video call, FISHY steps out of the picture so the frame shows only the call',
      'The step track is gone: each screen says what was found and what to do next',
    ],
  },
  {
    version: '0.3.1',
    date: '23 Nov 2026',
    items: [
      'A FISHY score out of 100 and a "Why" list for every picture, document, voice and video check',
      'Fixed: a clean file no longer shows "Take a closer look" when Gemini lists "no signs" as a sign',
      'Fixed: the voice check sends WAV, which Gemini accepts (Chrome records WebM)',
      'The step track now matches How it works: Check, See the signs, Call',
      'Clear messages when Gemini isn’t connected or Chrome needs the FISHY icon clicked on the call’s tab',
    ],
  },
  {
    version: '0.3.0',
    date: '23 Nov 2026',
    items: [
      'Check a picture, a document, a voice or the video call for signs of AI or tampering',
      'Hard evidence from the file itself: Content Credentials, AI labels, AI tools, photo editors',
      'Security fixes: PIN guessing, forged email headers, prompt injection, pdf.js and gRPC CVEs',
      'New font: Atkinson Hyperlegible Next',
    ],
  },
  {
    version: '0.2.0',
    date: '23 Nov 2026',
    items: [
      'Gemini explains the red flags, escalation after 10 minutes, the incident report',
      'Try FISHY in a browser, and the demo build of the extension',
    ],
  },
];
