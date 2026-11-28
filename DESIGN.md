---
version: 1
name: FISHY
description: An "is it real?" checker for pictures, PDFs, voices, video calls, websites and QR codes. The evidence-tag world: manila paper, black ink, one evidence red; condensed heavy Archivo for headings and the stamp, Atkinson Hyperlegible Next for text; square-ish tags instead of soft rounded cards. Quiet paper while you check, a red stamp when it's fishy.

colors:
  ink: "#141414"          # black ink: text, the header, primary buttons, icon tiles
  ink-2: "#3a352d"        # secondary text on paper
  muted: "#6a6253"        # labels, hints (5.7:1 on paper, 4.7:1 on manila)
  navy-2: "#2a2824"       # raised surfaces on ink (chips, icon buttons)
  on-navy: "#d8cfbc"      # secondary text on ink
  brand: "#c8221a"        # evidence red: the logo, the stamp, the "fishy" hero, the drop-zone icon. White on it 5.7:1
  brand-text: "#a51b14"   # red text on light
  bg: "#ede3cc"           # manila: the canvas
  surface: "#fbf8f1"      # paper: tags and panels
  surface-muted: "#f4eddf"
  note: "#e6dcc6"
  line: "#d6c9ad"         # the hairline edge of every tag
  line-soft: "#e4d9c1"
  danger: "#c8221a"
  danger-bg: "#f6dcd6"
  danger-text: "#a51b14"
  ok: "#1f5c3a"           # green ink: clean checks, "no clear signs"
  ok-bg: "#dde8d2"
  amber-bg: "#f6e3b0"
  amber-text: "#7a4a00"
  cloud-bg: "#e3e6ee"     # the "Cloud" badge
  cloud-text: "#2a3a66"
  focus: "#141414"

typography:
  display:   { fontFamily: Archivo Variable, fontStretch: 72%, fontWeight: 850, textTransform: uppercase on the home ("IS IT REAL?"), sentence case on results, lineHeight: 0.98 }
  stamp:     { fontFamily: Archivo Variable, fontStretch: 72%, fontWeight: 900, letterSpacing: 0.08em, uppercase }
  label:     { fontFamily: Archivo Variable, fontStretch: 72%, fontWeight: 800, uppercase, letterSpacing: 0.04em (section heads, result band) }
  body:      { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 13.5–15px, lineHeight: 1.45 }
  mono:      { fontFamily: JetBrains Mono, use: fingerprints, accounts, addresses }

radius: { sm: 4px, md: 6px, lg: 8px, chips: 3px, header: 0 }
---

# FISHY design system

## Overview

FISHY is a tool someone uses when something they were sent, or someone they're talking to, might be fake. The interface borrows from the world of evidence: **manila case files, black ink, and a red rubber stamp.** It stays quiet paper while you check, and gives the verdict to the stamp and the header: a red field and "Something's fishy." when the evidence adds up.

Mode: **Operate**. Brand lives in the stamp, the condensed labels, the tag-shaped surfaces and the logo.

## Where it comes from

The first look (Nov 21–28) was navy and coral on a cool grey, with soft white cards and one rounded font. On review (Nov 29) it read as the default look of generated apps. The evidence-tag world replaced it: the subject is checking evidence, so the materials of evidence lead.

- **Logo:** a red evidence tag with a punched hole, and a fish hook bent into a question mark ([brand/](brand/)).
- **Colour:** manila `#ede3cc`, paper `#fbf8f1`, ink `#141414`, evidence red `#c8221a`, and a green ink for clean results.
- **Type:**
  - Condensed heavy **Archivo** (its width axis at 72%) for headings, labels and the stamp, set the way case files and warning labels are.
  - **Atkinson Hyperlegible Next** for everything read, drawn to stay legible under pressure.

## Colours

**One colour per state:**

| State | Header (hero) | Pill |
|---|---|---|
| Ready / take a closer look | ink, paper text | ink-2 |
| Fishy | evidence red, white text | ink |
| No clear signs | ok-bg, green-ink text | ok |

- Red is for "fishy" and the logo only; the drop-zone icon is red because it's the main action.
- Icon tiles are ink on paper; on hover they turn red and tilt 4°.
- Where it ran: **On device** is an ink badge, **Cloud** is `cloud-bg` with `cloud-text`.
- All text passes WCAG AA; the watch switch's track passes 3:1 against paper.

## Typography

Two families:
- **Archivo** (condensed, 800–900) for headings, section labels, the result band, the score and the stamp.
- **Atkinson Hyperlegible Next** for text.
- **JetBrains Mono** stays for what is compared character by character.

Rules:
- The home says "IS IT REAL?" in capitals. Results speak in sentence case: "Something's fishy."
- Emphasis is weight and the stamp, never a new size.

## Layout

- **Width:** the panel is 400px wide, and works at 320px and 200% zoom.
- **The home** is only what FISHY can check: the drop zone (black dashed), four tiles two by two (Face on a call, Voice on a call, This website, A message), and the watch switch.
- **Surfaces** are paper tags with a 1px `line` edge, radius 6px; rows inside are separated by `line-soft`.
- **The header and evidence headers** are square at the bottom.

## Elevation

Flat. A tag is set off by its hairline edge (`box-shadow: 0 0 0 1px var(--line)`), not a shadow. Only the floating window over a page carries a shadow, because it floats over someone else's page.

## Shapes

Radius 4 (small controls), 6 (tags, tiles, buttons), 8 (large surfaces), 3 (chips, pills, the stamp's corners), 0 (headers). Icons are 1.8px stroke SVG inside square-ish ink tiles. Pictograms in the scam guide are drawn geometry in one 2.4px stroke with one red accent.

## Components

- **Hero**: pill, one-sentence title, one line of advice, then the four-step track (Read, Check, Match, Call). While calling: a countdown line ("No answer in 9:42: FISHY calls Sari") or the approval-page link.
- **Step track**: done is a check, flagged is "!", now is a ring. The small track on evidence screens shows the same states, with an outline on the current step.
- **Red flag row**: icon tile, title, one line of evidence, chevron to the evidence screen. Grouped by step, with one source badge per group.
- **Why this is risky**: Gemini's two or three sentences in a plain surface, with where it ran.
- **What the checks found**: one card per picture, document, voice or video frame: the preview (or the waveform), what the file says about itself, then what Gemini saw or heard with where it ran, and the reminder that these are signs, not proof.
- **Pins**: where Gemini points, numbered coral boxes (2 px, ink hairline outside) over the picture, the website screenshot or the video frame, each with a coral number disc at its top-left corner. The same disc starts that reason in Why. A video card opens on the first pinned frame.
- **No payment UI**: since 0.9.0 there is no request card, call bar, "Hold the payment" or approval end state. The hero says "Fishy", "Take a closer look" or "No clear signs", and advises checking with the person another way.
- **Scam guide** (the "Scams" tab): one surface per scam with a 64 px pictogram (drawn geometry in one 2.4 stroke, one coral accent, on the note tile), the name, one sentence of how it works, three signs, then which check to use (muted, check icon) and what to do (bold, phone icon). A scam the current checks matched gets a coral ring and a "Seen in your checks" pill after its name.
- **Scanner home**: “Is it real?”, then three numbered steps readable at a glance: **1 Something you were sent** (the drop zone), **2 What’s open in this tab** (three big actions: The face, The voice, The website), **3 Then: call the real person** (a tinted note with a coral number). “Paste a message instead” is a small link under them. There is no demo case: FISHY starts empty. A file can be dropped anywhere on the window.
- **How it ran** (trail): pills in a row, green for on this laptop, blue for the cloud: Laptop checks → Gemini Nano → Gemini cloud, with why the cloud was asked under the step. Shows the hybrid path on every result.
- **Evidence the laptop measured**: a filmstrip of the video frames (an “=” on a frame that didn't change), a pitch line on a fixed one-octave scale (a flat voice looks flat), and a re-save heat map behind a text toggle. Their rows sit in Details under “Measured on this laptop”.
- **Looks like** (scam type): a white surface, a small coral tile with "!" beside one heading "Looks like: <scam>", its signs, and what to do with a phone icon. Other matches in one muted line. No eyebrow label and no coloured side border.
- **AI chip** (header): a pill on navy with a dot. Green: Gemini Nano (+ cloud). Blue: cloud only. Amber, pulsing: Nano getting ready. Grey: laptop checks only or offline. Its title says what that means.
- **Odds chips** (Why): each reason ends with its weight, a small pill: red "×8" when it raised the odds, green "÷2" when it lowered them. "How is this scored?" under the list opens the explanation on demand.
- **Watch panel**: a white row "Keep watching this call" with a switch on the right (off track `#76889a`, 3.6:1 against white) under the three actions. Not dashed: a dashed border means "drop a file here" in FISHY. Once on, a surface with a live coral dot, Stop, and a meter from "Looks real" (green) to "Looks fake" (red) with an ink marker. It turns red-outlined when it raises the alarm.
- **Outlined areas**: copy-move matches drawn as dashed coral boxes over the picture.
- **Still frames**: in the filmstrip, a frame that didn't change from the one before is greyed out (no glyph).
- **Hero follows the strongest check**: if any checked file, voice, video or website scores "high", the home hero is coral "Something's fishy." and names it, so the hero never says "not enough" above a red score.
- **Trail separators**: small drawn chevrons between the pills, not arrow characters.
- **Hand check**: an amber band under a video result: what to ask the caller, and “Check with hand”.
- **Result card**: the preview with the **stamp** (FISHY in red, SUSPECT in amber, LOOKS OK in green, rotated -8°, stamped on once with a short overshoot), the **score ring** that fills and counts up, the verdict band, and one sentence that says why (“Fishy because…”). Why is open; Details folds. A coral line sweeps over the picture while Gemini looks.
- **Take a closer look**: when there are signs but not enough to call it fishy, the hero goes navy (amber on the web) instead of saying "looks normal".
- **Evidence screens**: a comparison first (red-tinted "on this invoice" over green-tinted "paid the last 6 times"), then the checks list, then a privacy line.
- **End states**: "What to say now" (a line to get off the call), then "Start a new check" and "Copy the incident report link".
- **Approval page (phone)**: who is asked and how much, then two big buttons, "No, it wasn’t me" first in red, then the PIN with its own keyboard.

## Motion

Motion explains a change; it never decorates. `transform` and `opacity` move; text that arrives or swaps may also pass through a small blur (2–3px). Entrances and presses use `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`).

- A new result plays in once: the hero words rise, the track draws left to right, sections and red flags arrive in reading order (50–60ms apart). The same result never replays, including when you come back from an evidence screen.
- State changes blend in place (hero colour 320ms).
- Screens slide 18px from the side you moved towards (220ms).
- Presses scale to 0.97–0.985 within 140ms. Hovers exist only for a fine pointer.
- Reduced motion keeps the fades and colour changes, and drops the movement.

Moments built from the transitions.dev snippets (`extension/src/styles/transitions.css`, wired by `extension/src/lib/transitions.tsx`, shared with the web pages):

| Moment | Transition |
|---|---|
| Gemini is still writing the explanation | Shimmer text on "Gemini is reading the red flags…" |
| The explanation, "What to say now", each approval step, the Try FISHY result | Texts reveal: lines rise 12px out of a 3px blur, 40ms apart |
| "This result stays on the record" → "Link copied" | Text states swap (150ms) |
| A wrong PIN | Error state shake (280ms) with a red border that fades back |
| The end-state bar replacing the Call bar | The call bar's own slide-up |

A reveal moves a wrapper around a button, never the button itself, so the button keeps its pressed and disabled looks.

## Do's and don'ts

**Do**
- Give every risky state one colour, one sentence and one next step.
- Show where every AI result ran (On device or Cloud).
- Name the person in every call action, and never show a number taken from the message as one to call.
- Compare against the record instead of describing.
- Write plain finance English: "Hold the payment", "Pay to", "Number from Directory".

**Don't**
- Use coral for anything that isn't "hold" or the logo.
- Say a score proves anything ("likely synthetic", never "deepfake").
- Show unfinished features ("coming next"), or claim something that isn't built.
- Truncate amounts, accounts or anything people compare.
- Use the pun outside the amber warning: red and green speak plainly.

## Prompt guide (for agents changing the UI)

Use the tokens in `extension/src/styles/tokens.css` (the hosted pages import the same file). New screens follow the evidence-screen pattern (DetailHead, a comparison, a checks list, a privacy line). Test new text with `?data=worst` in a dev build: long Indonesian legal names, rupiah in the billions, titles before names, counts of exactly 1, empty lists. Keep motion to `transform` and `opacity`, entrance once per result, and gate hovers behind `(hover: hover) and (pointer: fine)`.
