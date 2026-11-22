// Places the call through the phone provider.

import twilio from 'twilio';

import type { CallProvider } from './ports.ts';

export function twilioCalls(accountSid: string, authToken: string, from: string): CallProvider {
  return {
    async placeCall({ to, twiml, statusCallbackUrl }) {
      // The client is made here, not when the function starts. A project that has
      // no phone account yet (placeholder secrets, calls switched off) can then
      // still start a check and use the approval page: the gate stops it before
      // this line is ever reached.
      const client = twilio(accountSid, authToken);
      await client.calls.create({
        to,
        from,
        twiml,
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['completed'],
        // Ring for 30 seconds. Escalation to the next approver is a separate timer.
        timeout: 30,
      });
    },
  };
}
