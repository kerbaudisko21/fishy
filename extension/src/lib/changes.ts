// What changed in each version, newest first. Shown in Settings → About ("What's new") and kept
// in step with CHANGELOG.md. Add an entry with every version bump.

export interface Change {
  version: string;
  date: string;
  items: string[];
}

export const CHANGES: Change[] = [
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
