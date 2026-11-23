// FISHY Cloud Functions. The rules live in ./call, ./approve, ./learn and
// ./webrisk; this file only connects them to Firebase and reads the settings.
//
// Rule that never bends: the number we call comes from Firestore
// `directory/{personId}`, never from the request, the message or the client.
//
// Settings are deploy-time values, not interface controls. See functions/.env.example.
// Keys (Twilio) live in Secret Manager via defineSecret, never in the repo or the extension.
//
// Shapes match extension/src/lib/data.ts and web/src/api.ts. Keep them in step.

import { randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall, onRequest } from 'firebase-functions/https';
import { defineBoolean, defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import twilio from 'twilio';

import { answerApproval as answer, getApproval as loadApproval } from './approve/approval.ts';
import { parseAllowlist } from './call/gate.ts';
import { RequestError } from './call/ports.ts';
import type { CallProvider, CheckConfig, CheckDeps } from './call/ports.ts';
import { startCall } from './call/startCall.ts';
import { firestoreStore } from './call/store-firestore.ts';
import { twilioCalls } from './call/twilio-calls.ts';
import { handleVoice } from './call/webhooks.ts';
import { reportSuspects as report } from './learn/suspects.ts';
import { domainAge as ageOf, rdapOrg } from './rdap/domainAge.ts';
import { checkLinks as checkAll } from './webrisk/checkLinks.ts';
import { webRiskLookup } from './webrisk/web-risk-lookup.ts';

initializeApp();
// Jakarta region. It must match REGION in extension/src/lib/config.ts and web/src/api.ts,
// and the rewrite for /voice in firebase.json.
// The functions run as an account of their own, which may use the "fishy"
// database and nothing else. The project's default account is not used: in a
// shared project it would let these functions reach the other app's data.
// It is the full address, from the settings file: the Firebase CLI cannot give
// secrets to the short form "name@".
const RUNTIME_SERVICE_ACCOUNT = defineString('RUNTIME_SERVICE_ACCOUNT');
// At most three copies of each function. Left alone, each may grow to 100, and
// twelve functions then ask for more CPU than a region gives a project: the
// second deploy was refused for that ("Quota exceeded for total allowable CPU
// per project per region"). Three is plenty for a finance team, and it caps the bill.
setGlobalOptions({ region: 'asia-southeast2', serviceAccount: RUNTIME_SERVICE_ACCOUNT, maxInstances: 3 });

// The secrets carry FISHY's name. In a project shared with another app, a plain
// TWILIO_AUTH_TOKEN could be that app's secret, and setting ours would change theirs.
const TWILIO_ACCOUNT_SID = defineSecret('FISHY_TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('FISHY_TWILIO_AUTH_TOKEN');
const TWILIO_FROM = defineString('TWILIO_FROM', { default: '' });

// Both locks on real calls are closed unless a deployment opens them.
const CALLS_ENABLED = defineBoolean('CALLS_ENABLED', { default: false });
const CALL_ALLOWLIST = defineString('CALL_ALLOWLIST', { default: '' });
const CALLS_DAILY_CAP = defineInt('CALLS_DAILY_CAP', { default: 20 });

const APPROVAL_PAGE_ENABLED = defineBoolean('APPROVAL_PAGE_ENABLED', { default: false });
const PUBLIC_BASE_URL = defineString('PUBLIC_BASE_URL');
const COMPANY_NAME = defineString('COMPANY_NAME', { default: '' });
const COMPANY_DOMAIN = defineString('COMPANY_DOMAIN', { default: '' });

function config(): CheckConfig {
  return {
    callsEnabled: CALLS_ENABLED.value(),
    callAllowlist: parseAllowlist(CALL_ALLOWLIST.value()),
    dailyCallCap: CALLS_DAILY_CAP.value(),
    approvalPageEnabled: APPROVAL_PAGE_ENABLED.value(),
    publicBaseUrl: PUBLIC_BASE_URL.value(),
    // The approval page says "each link works once, for 10 minutes".
    approvalTtlMs: 10 * 60 * 1000,
    companyName: COMPANY_NAME.value(),
  };
}

const noCalls: CallProvider = {
  async placeCall() {
    throw new Error('This function does not place calls.');
  },
};

function deps(calls: CallProvider, authToken: string | null): CheckDeps {
  return {
    store: firestoreStore({ companyDomain: COMPANY_DOMAIN.value() }),
    calls,
    config: config(),
    now: () => Date.now(),
    newToken: () => randomBytes(32).toString('base64url'),
    validSignature: (signature, url, params) =>
      authToken !== null && twilio.validateRequest(authToken, signature ?? '', url, params),
  };
}

/** Passes on a refusal the caller may see. Anything else becomes a plain "internal" error. */
async function answering<Result>(run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RequestError) {
      throw new HttpsError(error.code, error.message);
    }
    throw error;
  }
}

const callerOf = (request: { auth?: { uid: string } }): { uid: string } | null =>
  request.auth ? { uid: request.auth.uid } : null;

/**
 * Step 4 · Call. Called from the side panel after it creates checks/{checkId} (summary only).
 * In: { checkId, personId }   (personId: a person or supplier contact in directory)
 * Out: { ok: true, call: 'placed' | 'not_placed', reason, approvalUrl }
 * Writes checks/{checkId}.call = { state, personId, placed, pinVerified, reason }.
 * The panel listens to checks/{checkId}.call.state: ringing | confirmed | not_me | no_answer.
 * `approvalUrl` is the web approval page for this check, when that page is switched on.
 * Escalation is driven by the panel: after 10 minutes without an answer it creates a new check
 * and calls the next approver on record. One check holds one call.
 */
export const startVerificationCall = onCall(
  { enforceAppCheck: true, secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN] },
  (request) => {
    const calls = twilioCalls(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value(), TWILIO_FROM.value());
    return answering(() => startCall(deps(calls, null), callerOf(request), request.data));
  },
);

/**
 * Twilio webhooks: the phone menu ("Press 1 if you asked for this. Press 2 if you did not."),
 * the key that was pressed, the PIN, and the end of the call. Reached through Hosting at
 * /voice/menu, /voice/choice, /voice/pin and /voice/status. Every request must carry a valid
 * Twilio signature. Pressing 2 sets the state to 'not_me' at once; a 'not_me' confirmed with
 * the PIN adds the reported account, domain and number to knownBad.
 */
export const voice = onRequest({ secrets: [TWILIO_AUTH_TOKEN] }, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).end();
    return;
  }
  const reply = await handleVoice(deps(noCalls, TWILIO_AUTH_TOKEN.value()), {
    path: request.path,
    query: request.query,
    body: request.body,
    signature: request.get('X-Twilio-Signature') ?? undefined,
  });
  if (reply.xml) {
    response.status(reply.status).type('text/xml').send(reply.xml);
  } else {
    response.status(reply.status).end();
  }
});

/**
 * The details of the request a check is about: accounts, domains and phone numbers only, never
 * message text. They join knownBad only if the real person says "not me" and enters their PIN.
 * In: { checkId, suspects: { accounts: string[], domains: string[], numbers: string[] } }
 * Out: { kept: number }. Call it before or right after startVerificationCall.
 */
export const reportSuspects = onCall({ enforceAppCheck: true }, (request) =>
  answering(() => report(deps(noCalls, null), callerOf(request), request.data)),
);

/**
 * Web approval page (judges' fallback): loads the request behind a one-time link token.
 * In: { token }
 * Out: { approverName, company, amount: { value, currency }, payee: "PT X, Bank •••• 1234", context, expiresAt (ms) }
 * Throws 'not-found' for an unknown, used or expired token, and when the page is switched off.
 */
export const getApproval = onCall({ enforceAppCheck: true }, (request) =>
  answering(() => loadApproval(deps(noCalls, null), request.data)),
);

/**
 * Web approval answer: same answer + PIN as the phone menu, through the same steps.
 * In: { token, answer: 'yes' | 'no', pin }
 * Out: { ok: true }. Throws 'permission-denied' for a wrong PIN (three tries), 'not-found' once the link is used.
 */
export const answerApproval = onCall({ enforceAppCheck: true }, (request) =>
  answering(() => answer(deps(noCalls, null), request.data)),
);

/**
 * Step 2 · Check links with Google Web Risk. In: { urls: string[] } (links only, never the email).
 * Out: { unsafe: string[], checked: number, advisory: { text, url } | null }
 * `unsafe` is the subset Web Risk lists as malware, social engineering or unwanted software.
 * Query strings and fragments are removed before the lookup. Wherever a match is shown,
 * `advisory.text` ("Advisory provided by Google") must be shown with it.
 */
export const checkLinks = onCall({ enforceAppCheck: true }, async (request) => {
  try {
    return await checkAll({ lookup: webRiskLookup(), now: () => Date.now() }, callerOf(request), request.data);
  } catch (error) {
    if (error instanceof RequestError) {
      throw new HttpsError(error.code, error.message);
    }
    throw new HttpsError('unavailable', 'The links could not be checked.');
  }
});

/*
 * ---------- Not built yet ----------
 * The contracts below are the ones the frontend already calls.
 */

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
 * Throws 'not-found' when RDAP has no registration date for it.
 */
export const domainAge = onCall({ enforceAppCheck: true }, async (request) => {
  try {
    return await ageOf({ rdap: rdapOrg(), now: () => Date.now() }, callerOf(request), request.data);
  } catch (error) {
    if (error instanceof RequestError) {
      throw new HttpsError(error.code, error.message);
    }
    throw new HttpsError('unavailable', 'The domain age could not be looked up.');
  }
});
