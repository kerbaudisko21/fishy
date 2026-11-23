# Changelog

Each version's build also shows in the extension under **Settings → About** (version, commit, build time and what's new). The same list lives in `extension/src/lib/changes.ts`.

## 0.3.1 · 23 Nov 2026
- A FISHY score out of 100 and a "Why" list for every picture, document, voice and video check
- Fixed: a clean file no longer shows "Take a closer look" when Gemini lists "no signs" as a sign
- Fixed: the voice check sends WAV, which Gemini accepts (Chrome records WebM)
- The step track now matches How it works: Check, See the signs, Call
- Clear messages when Gemini isn't connected, or when Chrome needs the FISHY icon clicked on the call's tab

## 0.3.0 · 23 Nov 2026
- Check a picture, a document, a voice or the video call for signs of AI or tampering
- Hard evidence from the file itself: Content Credentials, AI labels, AI tools, photo editors
- Security fixes: PIN guessing, forged email headers, prompt injection, pdf.js and gRPC CVEs (npm audit: 0)
- New font: Atkinson Hyperlegible Next

## 0.2.0 · 23 Nov 2026
- Gemini explains the red flags, escalation after 10 minutes, the incident report and audit log
- Try FISHY in a browser, and the demo build of the extension
- Design review fixes, worst-case data, phone pages, accessibility, transitions, DESIGN.md

## 0.1.0 · 21–22 Nov 2026
- The side panel, the on-device checks, the phone check with Twilio, the web approval page, the deploy setup
