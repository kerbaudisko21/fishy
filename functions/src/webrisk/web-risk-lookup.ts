// Asks Google Web Risk whether an address is on one of its lists.
//
// It uses the function's own service account, so there is no API key to keep.
// Web Risk only knows addresses that are already on its lists: a lookalike
// domain registered this morning will not be there. The lookalike check on
// the laptop covers that case.

import { protos, WebRiskServiceClient } from '@google-cloud/web-risk';

import type { ThreatLookup } from './checkLink.ts';

const ThreatType = protos.google.cloud.webrisk.v1.ThreatType;
const LISTS = [ThreatType.MALWARE, ThreatType.SOCIAL_ENGINEERING, ThreatType.UNWANTED_SOFTWARE];

export function webRiskLookup(): ThreatLookup {
  const client = new WebRiskServiceClient();
  return {
    async search(uri) {
      const [response] = await client.searchUris({ uri, threatTypes: LISTS });
      const threat = response.threat;
      const threatTypes = (threat?.threatTypes ?? [])
        .map((type) => (typeof type === 'number' ? ThreatType[type] : String(type)))
        .filter((name): name is string => typeof name === 'string' && name !== '');
      const seconds = threat?.expireTime?.seconds;
      const expireTime =
        seconds === null || seconds === undefined ? null : new Date(Number(seconds) * 1000).toISOString();
      return { threatTypes, expireTime };
    },
  };
}
