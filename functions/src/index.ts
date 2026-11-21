/*
 * FISHY Cloud Functions. Skeleton only: each function lists what it must do.
 * Keys (Twilio, Web Risk) live in Secret Manager via defineSecret, never in the repo or the extension.
 *
 * Rule that never bends: the number we call comes from Firestore `directory/{personId}`,
 * never from the request, the message or the client.
 */
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();
// Jakarta region; change if the team picks another.
setGlobalOptions({ region: 'asia-southeast2' });

/**
 * Step 4 · Call. Called from the side panel after it creates checks/{checkId} (summary only).
 * In: { checkId, personId }   (personId: a person or supplier id in directory)
 * TODO: look up the phone in directory/{personId}; create a Twilio call to voiceMenu;
 * write checks/{checkId}.call = { state: 'ringing', personId, escalateAt: Timestamp };
 * after 10 minutes with no answer: state 'escalated', escalatedTo: '<next approver name>'.
 * The panel listens to checks/{checkId}.call.state: ringing | confirmed | not_me | no_answer | escalated.
 */
export const startVerificationCall = onCall({ enforceAppCheck: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  throw new HttpsError('unimplemented', 'startVerificationCall is not built yet.');
});

/**
 * Twilio webhook: the phone menu. "Press 1 if you asked for this. Press 2 if you did not."
 * TODO: validate the Twilio signature; read the request summary from Firestore; reply with TwiML <Gather numDigits=1>.
 */
export const voiceMenu = onRequest(async (_req, res) => {
  res.status(501).send('voiceMenu is not built yet.');
});

/**
 * Twilio webhook: digit pressed, then the 4-digit PIN.
 * TODO: check the PIN hash in directory/{personId}; set checks/{checkId}.call.state to 'confirmed' or 'not_me';
 * on 'not_me', add the account/domain/number to knownBad and send an FCM team alert (summary only).
 */
export const voiceAnswer = onRequest(async (_req, res) => {
  res.status(501).send('voiceAnswer is not built yet.');
});

/*
 * ---------- Contracts the frontend already calls ----------
 * Shapes match extension/src/lib/data.ts and web/src/api.ts. Keep them in step.
 */

/**
 * Web approval page (judges' fallback): loads the request behind a one-time link token.
 * In: { token }
 * Out: { approverName, company, amount: { value, currency }, payee: "PT X, Bank •••• 1234", context, expiresAt (ms) }
 * Throw 'not-found' for an unknown, used or expired token.
 */
export const getApproval = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'getApproval is not built yet.');
});

/**
 * Web approval answer: same answer + PIN as the phone menu.
 * In: { token, answer: 'yes' | 'no', pin }
 * Out: { ok: true }. Throw 'permission-denied' for a wrong PIN. Mark the token used.
 */
export const answerApproval = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'answerApproval is not built yet.');
});

/**
 * Finance manager's incident report (summary only, never message text).
 * In: { id }
 * Out: { id, at (ms), status: 'stopped' | 'confirmed' | 'open', where, targeted, posedAs, askedFor, confirmed, flags: string[], handled }
 * Only for users with the finance-manager role (custom claim).
 */
export const getIncident = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'getIncident is not built yet.');
});

/** In: { id } · Out: { ok: true } */
export const markIncidentHandled = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'markIncidentHandled is not built yet.');
});

/** Audit and compliance: what was checked and who confirmed. In: { id } · Out: { entries: [{ at (ms), what }] } */
export const getAuditLog = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'getAuditLog is not built yet.');
});

/**
 * Stores this browser's FCM token for team alerts. In: { token } · Out: { ok: true }
 * The push payload is data-only: { title, body, incidentId } (see web/public/firebase-messaging-sw.js).
 */
export const registerAlertToken = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'registerAlertToken is not built yet.');
});

/**
 * R8 · Voice-clone score for a clip the user chose to send (10 s of meeting audio, webm/opus).
 * In: { audio: base64, mime } · Out: { score: 0–1 }
 * Call the voice-check API (deck: Modulate developer plan), then drop the clip; never store it.
 */
export const scoreVoice = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'scoreVoice is not built yet.');
});

/**
 * R3 · Domain age via RDAP (only the domain is sent). In: { domain } · Out: { days, registered: "12 Nov 2026" }
 * Throw 'not-found' when RDAP has no record.
 */
export const domainAge = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'domainAge is not built yet.');
});

/**
 * Step 2 · Check links with Google Web Risk. In: { urls: string[] } (links only, never the email).
 * Out: { unsafe: string[] }  (the subset Web Risk lists as malware, social engineering or unwanted software)
 */
export const checkLinks = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'checkLinks is not built yet.');
});
