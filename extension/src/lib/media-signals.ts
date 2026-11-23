import type { MediaCheck, Signal } from './types';

/**
 * Red flags from the files the person checked. What a file says about itself is hard evidence;
 * what Gemini sees or hears is a supporting sign. Neither is proof that a file is real.
 */
export function mediaSignals(items: MediaCheck[]): Signal[] {
  const out: Signal[] = [];
  const first = <K extends Signal['kind']>(kind: K) => !out.some((s) => s.kind === kind);
  for (const m of items) {
    const facts = m.facts ?? {};
    if (facts.aiLabel && first('ai_label')) {
      out.push({ kind: 'ai_label', step: 'check', source: 'on_device', title: 'Labelled as made by AI', detail: `${m.name}: ${facts.aiLabel}.` });
    }
    if (facts.aiTool && first('ai_tool')) {
      out.push({ kind: 'ai_tool', step: 'check', source: 'on_device', title: `Made with ${facts.aiTool}`, detail: `${m.name}: the AI tool is named in the file’s data.` });
    }
    if (facts.editedWith && first('edited_with')) {
      out.push({ kind: 'edited_with', step: 'check', source: 'on_device', title: `Edited in ${facts.editedWith}`, detail: `${m.name}: the editor is named in the file’s data.` });
    }
    const g = m.gemini;
    if (!g || g.assessment === 'no_clear_signs' || (g.assessment === 'unclear' && !g.signs.length)) continue;
    const voice = m.kind === 'voice';
    const kind = voice ? 'voice_signs' : 'picture_signs';
    if (!first(kind)) continue;
    const what = voice ? 'voice' : m.kind === 'frame' ? 'video' : m.kind === 'document' ? 'document' : 'picture';
    const title =
      g.assessment === 'likely_ai'
        ? voice ? 'Signs of a cloned voice' : `Signs of AI in the ${what}`
        : g.assessment === 'likely_edited'
          ? voice ? 'Signs the voice was spliced' : `Signs the ${what} was edited`
          : voice ? 'Something odd in the voice' : `Something odd in the ${what}`;
    const lead = g.signs[0] ? `${g.signs[0].sign}${g.signs[0].where ? ` (${g.signs[0].where})` : ''}` : 'Gemini found signs';
    const more = g.signs.length > 1 ? `, plus ${g.signs.length - 1} more` : '';
    out.push({
      kind,
      step: 'check',
      source: g.source,
      title,
      detail: `${lead}${more}. A sign, not proof.`,
      strength: g.assessment === 'unclear' ? 1 : 3,
    });
  }
  return out;
}
