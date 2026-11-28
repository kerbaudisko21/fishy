---
version: 1
name: FISHY
description: An "is it real?" checker for pictures, documents, voices and video calls, beside Google Meet and Gmail. Navy and coral from the logo, a cool tide-grey canvas, white rounded surfaces, Atkinson Hyperlegible Next for everything, and one colour per verdict state. Calm while watching, loud only when money is at risk.

colors:
  ink: "#10202e"          # navy, from the logo: text, primary buttons, the header
  ink-2: "#34434f"        # secondary text on light
  muted: "#5a6874"        # labels, hints, metadata (4.9:1 on white)
  navy-2: "#1b3042"       # raised surfaces on navy (chips, icon buttons)
  on-navy: "#c8d3dc"      # secondary text on navy
  brand: "#f26b4e"        # coral, from the logo: the "hold the payment" state and the logo. Fills only; too light for text on white
  brand-text: "#b83a22"   # coral text on light (big numbers, scores)
  bg: "#eaeff1"           # tide: the canvas
  surface: "#ffffff"
  surface-muted: "#f2f5f6"
  note: "#e1e8eb"         # quiet notes, selection, passive icon tiles
  line: "#d9e1e4"
  line-soft: "#e8eef0"
  danger: "#b42a14"       # "Do not pay"
  danger-bg: "#fde1d9"
  danger-text: "#a3260f"
  ok: "#0e5a50"           # confirmed, clean checks
  ok-bg: "#d6eee7"
  ok-line: "#9fd3c7"
  amber-bg: "#fff1d6"
  amber-text: "#8a4b00"
  cloud-bg: "#e3ecf7"     # the "Cloud" badge
  cloud-text: "#1d4a80"
  demo: "#f2c14e"         # the Demo tag only
  focus: "#10202e"        # focus ring (white on navy and on the red hero)

typography:
  hero:      { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 30px (22px at the narrowest), fontWeight: 700, lineHeight: 1.08, letterSpacing: -0.01em }
  detail-h1: { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 26px, fontWeight: 700, lineHeight: 1.12 }
  amount:    { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 24px (scales with its card), fontWeight: 700, fontVariantNumeric: tabular-nums }
  section:   { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 17px, fontWeight: 700 }
  body:      { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 14–14.5px, lineHeight: 1.45–1.55 }
  meta:      { fontFamily: Atkinson Hyperlegible Next Variable, fontSize: 12.5–13px, color: muted }
  mono:      { fontFamily: JetBrains Mono, use: bank accounts, masked numbers, sender addresses }

radius: { sm: 10px, md: 14px, lg: 18px, hero-bottom: 26px, pill: 999px }
---

# FISHY design system

## Overview

FISHY is a tool someone uses under pressure: a "CFO" is on a video call asking for an urgent transfer, or a receipt or a voice note arrives that asks them to act, and they have seconds to decide whether it is real. The interface is built for that moment. It stays quiet (navy, white, tide grey) while it watches, and gives the whole top of the panel to one colour and one sentence when something is wrong. Every screen answers *why* with a comparison (this email against the one on record, this account against six months of payments), not with prose.

The surface mode is **Operate**: scanability, plain finance language and native expectations come before expression. Brand lives in the details: the navy header, the coral hero, the four-step track, the On device / Cloud badges.

## Where it comes from

The language was set in the FISHY deck (#BuildHybridAI 2026): navy `#0E1C27`, coral `#F2694B`, a warm bone canvas `#F1EFE7`, cards `#FAF9F4`, Space Grotesk for headings, Inter for text, JetBrains Mono for data. The product keeps the navy, the coral and JetBrains Mono. It replaced the deck's Inter and Space Grotesk with Atkinson Hyperlegible Next (see Typography), and made these deliberate changes:

| Deck | Product | Why |
|---|---|---|
| Bone canvas `#F1EFE7` (warm) | Tide canvas `#EAEFF1` (cool) | The panel sits beside Gmail and Meet, which are cool greys and white. A warm panel reads as a different app glued on |
| Coral as an accent everywhere (eyebrows, icons, highlights) | Coral only for "hold the payment" and the logo | In the product coral is a warning. Used for focus, tabs and icons it stopped meaning anything (design review, Nov 23) |
| Eyebrow labels in tracked caps | No eyebrows | Slides need wayfinding; a 400px panel needs the space |

The navy is a shade lighter in the product (`#10202E`) to keep 4.5:1 for `on-navy` text at panel sizes.

The original screen wireframes are the deck's slide 11 ("Nine screens, one side panel"). They were sketches; the built screens are the source of truth now.

## Colours

**One colour per state.** The hero, the in-page banner and the step track always agree:

| State | Hero | Pill | Banner in Meet or Gmail |
|---|---|---|---|
| Watching / calling | ink (navy) | navy-2 | hidden / none |
| Hold the payment | brand (coral), ink text | ink | amber |
| Do not pay | danger, white text | white on danger | red |
| Confirmed / looks normal | soft green `#cdeae1`, deep green text | ok | green |

- Coral is a fill, never text on white (2.9:1). Coral text on light is `brand-text`.
- Red flags use `danger-bg` tiles with `danger-text` icons; clean checks use `ok-bg` with `ok`.
- Where it ran: **On device** is an ink badge, **Cloud** is `cloud-bg` with `cloud-text`. Every AI result carries one.
- All text passes WCAG AA (measured Nov 23 on every view, including the coral and red heroes).

## Typography

One family, **Atkinson Hyperlegible Next**, carries headings and text. The Braille Institute drew it to stay readable in hard conditions, which is when FISHY is read, and it replaced Inter and Space Grotesk (Nov 23): that pairing is the default of countless generated interfaces. JetBrains Mono stays for what people compare character by character: bank accounts, masked phone numbers, sender addresses. Emphasis comes from weight, never from a new size.

- The hero is one short sentence: "Something’s fishy." "Not verified." "Budi confirmed."
- Amounts are never truncated. A currency code (IDR) wraps above the number when the number needs the width; a one-character symbol ($) stays attached. Tabular figures.
- Names in sentences skip titles ("Call Kartika", not "Call Raden"). See `extension/src/lib/names.ts`.

## Layout

- The panel is 400px wide (it must work at 320px and at 200% zoom, about 200px).
- Page padding 16px; sections 22px apart; section heading 17px with an aside on the right.
- Surfaces are white, radius 18px, with a 1px bottom line instead of a shadow. Rows inside a surface are separated by `line-soft`.
- The hero and evidence headers end in a 26px bottom radius, so the page under them reads as one sheet.
- The action bar (who to call, the Call button) is fixed at the bottom, white, radius 22px on top, with the only real shadow in the product. Its content always names the person: "Call Budi on record".
- The hosted pages are phone-first: 440px max, 20px gutters, safe-area padding, 54px buttons.

## Elevation

Flat by default. A surface sits on the canvas with `box-shadow: 0 1px 0 var(--line)`. The only lifted element is the action bar (`0 -8px 24px rgba(16,32,46,.12)`), because it floats over content.

## Shapes

Radius 10 (small controls), 14 (buttons, tiles), 18 (surfaces), 26 (bottom of the hero), 999 (pills and badges). Icons are 1.8px stroke SVG, 24px grid, inside 36–40px rounded tiles.

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
