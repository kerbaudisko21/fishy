import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Verdict as VerdictT } from '../../lib/types';
import { Verdict } from './Verdict';

// The top of the result is the line people read. When Gemini never read the message and only
// the keyword list ran, "No clear signs" would be a false all-clear.

const nothing = () => {};
const CLEAR: VerdictT = { level: 'clear', flags: [], patterns: [], callAdvised: true };

function result(readerFailed: boolean) {
  return renderToStaticMarkup(
    createElement(Verdict, {
      verdict: CLEAR,
      hasInput: true,
      readerFailed,
      busy: null,
      onNewCheck: nothing,
      onOpenFlag: () => null,
      onOpen: nothing,
      onPaste: nothing,
      onFile: nothing,
      onOpenMedia: nothing,
      patternInfo: () => undefined,
      watch: null,
      onStopWatch: nothing,
    }),
  );
}

describe('the result when nothing was found', () => {
  it('says "No clear signs" when Gemini read the message', () => {
    const page = result(false);

    expect(page).toContain('No clear signs');
    expect(page).not.toContain('Partly checked');
  });

  it('says "Partly checked", not "No clear signs", when only the keyword list read it', () => {
    const page = result(true);

    expect(page).toContain('Partly checked');
    expect(page).toContain('Gemini didn’t read this.');
    expect(page).not.toContain('No clear signs');
  });
});
