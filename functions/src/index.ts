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
 * Step 4 · Call. Called from the side panel.
 * In: { checkId, personId, summary } where summary is signals only, never message text.
 * TODO: look up the phone in directory/{personId}; create a Twilio call to voiceMenu;
 * write checks/{checkId}.call = { state: 'ringing', personId, startedAt };
 * schedule escalation to the next approver after 10 minutes.
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

/**
 * Web approval page (judges' fallback): same answer + PIN as the phone menu, using a one-time link token.
 * In: { token, answer: 'yes' | 'no', pin }
 */
export const answerApproval = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'answerApproval is not built yet.');
});

/**
 * Step 2 · Check links with Google Web Risk. In: { urls: string[] } (links only, never the email).
 */
export const checkLinks = onCall({ enforceAppCheck: true }, async () => {
  throw new HttpsError('unimplemented', 'checkLinks is not built yet.');
});
