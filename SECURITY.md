# Security

FISHY handles things attackers control: the emails, PDFs, pictures, voices and calls it checks. This page says what protects it, what a review on 23 Nov 2026 found and fixed, and what is still open.

To report a problem, open a private security advisory on this repository.

## How it is protected

- **The number FISHY calls never comes from the message or the client.** Functions take a person's ID, read the number on record on the server and never send it back.
- **Twilio webhooks are signed**, checked against an address built from `PUBLIC_BASE_URL`, not from the request.
- **Links are tokens, stored hashed.** Approval and incident links carry 32 random bytes; only their SHA-256 is kept, compared in constant time. PINs are stored with scrypt and a salt per person.
- **Firestore rules close everything private** (directory phones and PINs, call records, reported details, counters). A client can create only a small check summary of a known shape, stamped with the server's time.
- **Files from strangers are read locked down.** pdf.js runs with `isEvalSupported: false` and no XFA forms; files over 20 MB are refused before they are read.
- **Model output cannot change the verdict directly.** Gemini answers in a fixed JSON shape (enums and short strings), shown as text; fixed rules decide. Untrusted text is fenced and labelled as data, and the keyword reader always runs beside Gemini.
- **Hosting sends security headers** (`nosniff`, `no-referrer`, no framing, HSTS).
- **CI** has read-only permissions and no secrets on pull requests; deploys run only from `main` with keyless workload identity; actions are pinned to commit SHAs and kept current by Dependabot.
- **Dependencies:** `npm audit` reports 0 known vulnerabilities (pdf.js upgraded to 6.5.438 for GHSA-hq66-cqwq-w95j; gRPC pinned to 1.14.7).

## Fixed on 23 Nov 2026

| Finding | Fix |
|---|---|
| PIN guessing across many checks for the same person | Wrong PINs are counted per person over all checks; after 5 in 24 hours every PIN is refused (fails closed). Switching from "yes" to "no" no longer resets the attempts. At most 5 checks per person per hour |
| Call spam against a person | The same 5-per-hour limit, on top of the daily cap |
| A forged `Authentication-Results` filling in a missing DMARC result | Only the topmost header counts, and only when Gmail (`mx.google.com`) wrote it |
| Prompt injection switching off the pressure reader | Keyword hits are always added to the model's; messages and pictures are fenced and labelled as data; file names stay out of what Gemini is given |
| pdf.js code execution on a malicious PDF | Upgraded and locked down (above) |
| Backdated or oversized check summaries | Firestore rules check the time, the fields, their types and sizes |
| No size limit on files | 20 MB, checked before reading |
| `tabs` permission not needed | Removed |
| No Hosting security headers | Added |
| Actions pinned by tag | Pinned by commit SHA, with Dependabot |

## Still open (known)

- **Live builds carry an App Check debug token.** `npm run package` builds without one; never hand out a build made from `.env.local`, and revoke a debug token if one leaves your hands. A real release needs a real App Check provider.
- **Anonymous sign-in.** Anyone with the public web key can sign in anonymously and read the masked directory and the known-scam list. A company release should use Google sign-in limited to the company's domain, and App Check on Firestore and Auth.
- **The web approval link goes back to the person who asked.** It is a demo device for judges (`APPROVAL_PAGE_ENABLED`, off by default). In real use the link should go to the approver on record, not to the requester.
- **Reported details join the known-scam list on a "not me" with the PIN.** A person tricked into saying "not me" could add an attacker's chosen domain or account ending. A company release should hold new entries for an admin to approve, and refuse free-mail domains.
- **The demo seed gives everyone the same PIN.** Use a different PIN of 6 digits or more for each real person.
- **Gemini can be fooled.** It reports signs, not proof; a good fake can pass every check. The call to the real person decides.
