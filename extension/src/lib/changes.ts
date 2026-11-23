// What changed in each version, newest first. Shown in Settings → About ("What's new") and kept
// in step with CHANGELOG.md. Add an entry with every version bump.

export interface Change {
  version: string;
  date: string;
  items: string[];
}

export const CHANGES: Change[] = [
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
