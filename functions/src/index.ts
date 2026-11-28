// FISHY Cloud Functions: the two lookups the website check needs that a browser can't do itself.
// Both take an address and nothing else, and both require App Check and a signed-in caller.
//
//   checkLinks  Google Web Risk: is this address on the unsafe-sites list?
//   domainAge   RDAP: when was this domain registered?
//
// Shapes match extension/src/lib/data.ts. Keep them in step.

import { initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/https';
import { defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

import { domainAge as ageOf, rdapOrg } from './rdap/domainAge.ts';
import { RequestError } from './request-error.ts';
import { checkLinks as checkAll } from './webrisk/checkLinks.ts';
import { webRiskLookup } from './webrisk/web-risk-lookup.ts';

initializeApp();
// Jakarta region. It must match REGION in extension/src/lib/config.ts.
// The functions run as an account of their own (full address from the settings file): in a
// project shared with another app, the default account would let them reach the other app's data.
const RUNTIME_SERVICE_ACCOUNT = defineString('RUNTIME_SERVICE_ACCOUNT');
// At most three copies of each function: plenty, and it caps the bill.
setGlobalOptions({ region: 'asia-southeast2', serviceAccount: RUNTIME_SERVICE_ACCOUNT, maxInstances: 3 });

const callerOf = (request: { auth?: { uid: string } }): { uid: string } | null => (request.auth ? { uid: request.auth.uid } : null);

/**
 * Google Web Risk. In: { urls: string[] } (addresses only). Out: { unsafe: string[], checked, advisory }
 * Query strings and fragments are removed before the lookup. Wherever a match is shown,
 * `advisory.text` ("Advisory provided by Google") must be shown with it.
 */
export const checkLinks = onCall({ enforceAppCheck: true }, async (request) => {
  try {
    return await checkAll({ lookup: webRiskLookup(), now: () => Date.now() }, callerOf(request), request.data);
  } catch (error) {
    if (error instanceof RequestError) throw new HttpsError(error.code, error.message);
    throw new HttpsError('unavailable', 'The links could not be checked.');
  }
});

/**
 * Domain age via RDAP (only the domain is sent). In: { domain } · Out: { days, registered: "12 Nov 2026" }
 * Throws 'not-found' when RDAP has no registration date for it.
 */
export const domainAge = onCall({ enforceAppCheck: true }, async (request) => {
  try {
    return await ageOf({ rdap: rdapOrg(), now: () => Date.now() }, callerOf(request), request.data);
  } catch (error) {
    if (error instanceof RequestError) throw new HttpsError(error.code, error.message);
    throw new HttpsError('unavailable', 'The domain age could not be looked up.');
  }
});
