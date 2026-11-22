// Places the call through the phone provider.

import twilio from 'twilio';

import type { CallProvider } from './ports.ts';

export function twilioCalls(accountSid: string, authToken: string, from: string): CallProvider {
  const client = twilio(accountSid, authToken);
  return {
    async placeCall({ to, twiml, statusCallbackUrl }) {
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
