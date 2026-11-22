// What the phone says, and the addresses the phone provider calls back.
//
// The same function builds the address that is given to the provider and the
// address a webhook's signature is checked against. They must match exactly,
// so the address is never rebuilt from the incoming request.

import twilio from 'twilio';

export type VoiceStep = 'menu' | 'choice' | 'pin' | 'status';

const SAY = { language: 'en-US' } as const;

export function hookUrl(baseUrl: string, step: VoiceStep, id: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/voice/${step}?v=${encodeURIComponent(id)}`;
}

/** Press 1 or 2. */
export function menuTwiml(baseUrl: string, id: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ['dtmf'],
    numDigits: 1,
    timeout: 8,
    action: hookUrl(baseUrl, 'choice', id),
    method: 'POST',
  });
  gather.say(
    SAY,
    'This is FISHY, the payment check. A payment request was made in your name. ' +
      'Press 1 if you made this request. Press 2 if you did not.',
  );
  response.say(SAY, 'No key was pressed. Goodbye.');
  response.hangup();
  return response.toString();
}

/** Then the PIN. `lead` says what just happened. */
export function pinTwiml(baseUrl: string, id: string, lead: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ['dtmf'],
    finishOnKey: '#',
    timeout: 10,
    action: hookUrl(baseUrl, 'pin', id),
    method: 'POST',
  });
  gather.say(SAY, `${lead} Enter your PIN, then press the hash key.`.trim());
  response.say(SAY, 'No PIN was entered. Goodbye.');
  response.hangup();
  return response.toString();
}

export function goodbyeTwiml(text: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say(SAY, text);
  response.hangup();
  return response.toString();
}
