# Changelog

Each version's build also shows in the extension under **Settings → About** (version, commit, build time and what's new). The same list lives in `extension/src/lib/changes.ts`.

## 0.5.0 · 28 Nov 2026
- Home says what to do at a glance: 1 something you were sent, 2 the call you are in (the face, the voice), 3 then call the real person
- Hybrid by design: Gemini Nano takes the first look on the laptop; FISHY asks the cloud model for a second opinion only when Nano can't tell, isn't sure, finds one sign, or disagrees with the laptop's own checks. The card shows the path it took
- The video check watches 3 seconds (5 frames) instead of one: it spots a frozen picture (a still photo played as a camera) and Gemini compares the frames side by side
- New hand check for a video call: ask the caller to pass a hand across their face; a live face swap often breaks up behind the hand
- Voice measurements on the laptop before Gemini listens: pitch movement (with a chart), room sound between words, background jumps between pauses, breaths and pause rhythm
- Picture checks on the laptop: the camera's stored preview against the picture, camera files re-saved by software (JPEG tables), and the grid pattern AI generators leave; a re-save heat map to look at yourself
- What the laptop measured goes to Gemini with the file, so its reading is grounded in numbers
- "Looks like": what kind of scam the checks point to (deepfake executive on a video call, cloned voice, real-time face swap, fake camera feed, doctored picture or payment screenshot, forged document…), with what to do
- Fixed: Remote Config's scam rules now add to the built-in rules instead of replacing them, so an older config can't switch the media checks off
- The test-data switch in development builds stays hidden unless ?data= is in the address

## 0.4.0 · 23 Nov 2026
- New Scanner layout: one big drop zone, three big buttons (Video, Voice, Message), and a list of your checks with their scores
- Every result says why in one sentence (“Fishy because…”), with a score ring that fills and counts up
- An ink stamp on each result: FISHY, SUSPECT or LOOKS OK
- A line sweeps over the picture while Gemini looks; Why and Details fold open and shut
- Drop a file anywhere on FISHY to check it
- Fixed: the call stays audible while the voice is recorded in the floating window
- Gemini errors now say what to do (for example: switch on AI Logic in the Firebase console)

## 0.3.2 · 23 Nov 2026
- FISHY opens as a floating window on top of the page: drag it, minimise it, click the icon again to close it
- The page is no longer squeezed by a side panel (the side panel is still in Chrome's side panel menu)
- While checking the video call, FISHY steps out of the picture so the frame shows only the call
- The step track is gone: each screen says what was found and what to do next

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
