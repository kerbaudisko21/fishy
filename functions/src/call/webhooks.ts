// The phone provider's callbacks: the menu, the key that was pressed, the
// PIN, and the end of the call.
//
// Every callback must carry a signature that proves it came from the phone
// provider and was meant for this exact check. Anything else gets a 403 and
// changes nothing. The body is never logged: it carries the PIN digits.

import { RECORD_ID } from './ports.ts';
import type { CheckDeps } from './ports.ts';
import { answerChoice, answerPin, withCallStatus } from './steps.ts';
import { goodbyeTwiml, hookUrl, menuTwiml, pinTwiml } from './twiml.ts';
import type { VoiceStep } from './twiml.ts';

export interface VoiceRequest {
  path: string;
  query: Record<string, unknown>;
  body: unknown;
  signature: string | undefined;
}

export interface VoiceReply {
  status: number;
  xml?: string;
}

const STEPS: readonly string[] = ['menu', 'choice', 'pin', 'status'];
const CLOSED = 'This check is already closed. Goodbye.';

/** The step from the path. The function is reached as /voice/menu or as /menu. */
function stepFrom(path: string): VoiceStep | null {
  const step = path.replace(/^\/voice(?=\/)/, '').replace(/^\/+|\/+$/g, '');
  return STEPS.includes(step) ? (step as VoiceStep) : null;
}

/** The form fields the provider sent. Only plain text fields count. */
function formFields(body: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (typeof body === 'object' && body !== null) {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        fields[key] = value;
      }
    }
  }
  return fields;
}

export async function handleVoice(deps: CheckDeps, request: VoiceRequest): Promise<VoiceReply> {
  const step = stepFrom(request.path);
  const id = typeof request.query.v === 'string' ? request.query.v : '';
  if (!step || !RECORD_ID.test(id)) {
    return { status: 404 };
  }
  const base = deps.config.publicBaseUrl;
  const fields = formFields(request.body);
  if (!deps.validSignature(request.signature, hookUrl(base, step, id), fields)) {
    return { status: 403 };
  }

  if (step === 'menu') {
    const found = await deps.store.getVerification(id);
    return found ? { status: 200, xml: menuTwiml(base, id) } : { status: 404 };
  }

  if (step === 'choice') {
    const { outcome, verification } = await answerChoice(deps, id, fields.Digits ?? '');
    if (!verification) {
      return { status: 404 };
    }
    switch (outcome) {
      case 'ask_pin':
        return { status: 200, xml: pinTwiml(base, id, '') };
      case 'denied':
        return {
          status: 200,
          xml: pinTwiml(base, id, 'Recorded. This request is marked as not yours. To confirm it is you speaking,'),
        };
      case 'invalid':
        return { status: 200, xml: menuTwiml(base, id) };
      default:
        return { status: 200, xml: goodbyeTwiml(CLOSED) };
    }
  }

  if (step === 'pin') {
    const { outcome, verification } = await answerPin(deps, id, fields.Digits ?? '');
    if (!verification) {
      return { status: 404 };
    }
    switch (outcome) {
      case 'confirmed':
        return { status: 200, xml: goodbyeTwiml('Thank you. The request is confirmed. Goodbye.') };
      case 'denied_verified':
        return { status: 200, xml: goodbyeTwiml('Thank you. The request stays marked as not yours. Goodbye.') };
      case 'retry':
        return { status: 200, xml: pinTwiml(base, id, 'That PIN is not right.') };
      case 'pin_failed':
        return {
          status: 200,
          xml: goodbyeTwiml('The PIN was wrong three times. The request is not confirmed. Goodbye.'),
        };
      case 'denied_unverified':
        return {
          status: 200,
          xml: goodbyeTwiml('The PIN was wrong three times. The request stays marked as not yours. Goodbye.'),
        };
      default:
        return { status: 200, xml: goodbyeTwiml(CLOSED) };
    }
  }

  const updated = await deps.store.updateVerification(id, (current) =>
    withCallStatus(current, fields.CallStatus ?? '', deps.now()),
  );
  return { status: updated ? 204 : 404 };
}
