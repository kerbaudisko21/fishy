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
      out.push({ kind: 'ai_label', step: 'check', source: 'on_device', title: 'Labelled as made by AI', detail: `${facts.aiLabel}.` });
    }
    if (facts.aiTool && first('ai_tool')) {
      out.push({ kind: 'ai_tool', step: 'check', source: 'on_device', title: `Made with ${facts.aiTool}`, detail: 'The AI tool is named in the file’s data.' });
    }
    if (facts.editedWith && first('edited_with')) {
      out.push({ kind: 'edited_with', step: 'check', source: 'on_device', title: `Edited in ${facts.editedWith}`, detail: 'The editor is named in the file’s data.' });
    }
    // The laptop's own measurements.
    const hints = m.forensics?.hints ?? [];
    if (hints.some((h) => h.id === 'frozen') && first('video_frozen')) {
      out.push({ kind: 'video_frozen', step: 'check', source: 'on_device', title: 'The video didn’t move', detail: 'Possibly a still picture played as a camera, or a frozen connection. Ask them to wave.' });
    }
    const pixel = hints.filter((h) => ['thumbnail', 'grid', 'resaved'].includes(h.id));
    if ((pixel.some((h) => h.strength === 2) || pixel.length >= 2) && first('tamper_trace')) {
      out.push({ kind: 'tamper_trace', step: 'check', source: 'on_device', title: 'Signs of tampering in the pixels', detail: `${pixel[0].text} A sign, not proof.`, strength: pixel.length >= 2 ? 2 : 1 });
    }
    const voiceHints = m.kind === 'voice' ? hints : [];
    if (voiceHints.length && first('voice_artifacts')) {
      out.push({ kind: 'voice_artifacts', step: 'check', source: 'on_device', title: 'Odd measurements in the voice', detail: `${voiceHints[0].text} A sign, not proof.`, strength: voiceHints.some((h) => h.strength === 2) ? 2 : 1 });
    }

    const g = m.gemini;
    if (!g || g.assessment === 'no_clear_signs' || (g.assessment === 'unclear' && !g.signs.length)) continue;
    const voice = m.kind === 'voice';
    const likely = g.assessment === 'likely_ai' || g.assessment === 'likely_edited';
    if (m.challenge && likely && first('liveness_failed')) {
      const lead = g.signs[0] ? `${g.signs[0].sign}${g.signs[0].where ? ` (${g.signs[0].where})` : ''}` : 'The face changed behind the hand';
      out.push({ kind: 'liveness_failed', step: 'check', source: g.source, title: 'The face broke up behind a hand', detail: `${lead}. Real faces don’t do this; real-time face swaps often do.`, strength: 3 });
      continue;
    }
    const kind = voice ? 'voice_signs' : m.kind === 'frame' ? 'video_signs' : m.kind === 'document' ? 'document_signs' : 'picture_signs';
    if (!first(kind)) continue;
    const what = voice ? 'voice' : m.kind === 'frame' ? 'video' : m.kind === 'document' ? 'document' : 'picture';
    const title =
      g.assessment === 'likely_ai'
        ? voice ? 'Signs of a cloned voice' : m.kind === 'frame' ? 'Signs of a deepfake face' : `Signs of AI in the ${what}`
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
      strength: likely ? 3 : 1,
    });
  }
  return out;
}
