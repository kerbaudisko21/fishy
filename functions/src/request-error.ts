/** A refusal with a reason the caller can act on; index.ts turns it into an HttpsError. */
export type RequestErrorCode = 'unauthenticated' | 'invalid-argument' | 'not-found' | 'permission-denied' | 'failed-precondition' | 'resource-exhausted';

export class RequestError extends Error {
  code: RequestErrorCode;

  constructor(code: RequestErrorCode, message: string) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
  }
}
