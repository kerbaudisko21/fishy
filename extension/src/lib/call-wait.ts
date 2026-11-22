// What the panel says while a check waits for its answer.
//
// The answer comes from a phone call to the number on record. In a demo without
// a phone account, no call is placed and the approver answers on the web
// approval page instead. The panel must say which of the two is happening: it
// never says "calling" when no phone call was placed.

/** What Cloud Functions answers when a check is started. */
export interface StartResult {
  call: 'placed' | 'not_placed';
  reason: string | null;
  approvalUrl: string | null;
}

export interface Waiting {
  pill: string;
  title: string;
  line: string;
  /** The approval page to open, when the answer will come from the page. */
  approvalUrl: string | null;
}

const WHY_NOT: Record<string, string> = {
  calls_disabled: 'phone calls are switched off',
  not_on_allowlist: 'this number is not on the list of numbers that may be called',
  daily_cap_reached: 'the limit of calls for today is used up',
  provider_error: 'the phone service did not take the call',
};

/** The link is shown as something to click, so it must be a secure web address and nothing else. */
export function safeApprovalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** `started` is undefined until Cloud Functions has answered. */
export function waitingFor(target: { who: string; phoneMasked: string }, started: StartResult | undefined): Waiting {
  if (!started || started.call === 'placed') {
    return {
      pill: 'Calling',
      title: `Calling the real ${target.who}…`,
      line: `${target.phoneMasked} from Directory. Waiting for them to press 1 or 2.`,
      approvalUrl: null,
    };
  }
  const why = started.reason ? WHY_NOT[started.reason] : undefined;
  const notPlaced = why ? `No phone call was placed: ${why}.` : 'No phone call was placed.';
  const approvalUrl = safeApprovalUrl(started.approvalUrl);
  return approvalUrl
    ? { pill: 'Waiting', title: `Waiting for the real ${target.who}…`, line: `${notPlaced} They answer on the approval page, with their PIN.`, approvalUrl }
    : { pill: 'Not called', title: `${target.who} was not called.`, line: `${notPlaced} Keep holding the payment.`, approvalUrl: null };
}
