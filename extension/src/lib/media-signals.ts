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
    if (m.kind === 'site') {
      const look = hints.find((h) => h.id === 'lookalike');
      if (look && first('lookalike_site')) out.push({ kind: 'lookalike_site', step: 'check', source: 'on_device', title: 'Copies a supplier’s address', detail: look.text });
      if (hints.some((h) => h.id === 'unsafe') && first('unsafe_link')) {
        out.push({ kind: 'unsafe_link', step: 'match', source: 'cloud', title: 'On the unsafe-sites list', detail: 'Google Web Risk lists this address.' });
      }
      if (hints.some((h) => h.id === 'young' || h.id === 'young_months') && first('young_domain')) {
        out.push({ kind: 'young_domain', step: 'check', source: 'cloud', title: 'A new website', detail: hints.find((h) => h.id === 'young' || h.id === 'young_months')!.text });
      }
      const risky = hints.filter((h) => !['lookalike', 'unsafe', 'young', 'young_months'].includes(h.id));
      if ((risky.some((h) => h.strength === 2) || risky.length >= 2) && first('site_risk')) {
        out.push({ kind: 'site_risk', step: 'check', source: 'on_device', title: 'Risky website', detail: `${risky[0].text} A sign, not proof.`, strength: risky.length >= 2 ? 2 : 1 });
      }
    }
    const qr = hints.find((h) => h.id === 'qr_risky' || h.id === 'qr_checksum' || h.id === 'qr_name_close') ?? hints.find((h) => h.id === 'qr_redirect');
    if (qr && first('qr_risky')) out.push({ kind: 'qr_risky', step: 'check', source: 'on_device', title: 'A risky QR code', detail: qr.text });
    if (m.kind !== 'site' && hints.some((h) => h.id === 'unsafe') && first('unsafe_link')) {
      out.push({ kind: 'unsafe_link', step: 'match', source: 'cloud', title: 'QR code to an unsafe site', detail: 'Google Web Risk lists the address in the QR code.' });
    }
    const lips = hints.find((h) => h.id === 'lipsync');
    if (lips && first('lipsync_off')) out.push({ kind: 'lipsync_off', step: 'check', source: 'on_device', title: 'Mouth and voice out of step', detail: `${lips.text} A sign, not proof.` });
    const reported = hints.find((h) => h.id === 'reported');
    if (reported && first('reported_before')) out.push({ kind: 'reported_before', step: 'match', source: 'cloud', title: 'Reported as a scam before', detail: reported.text });
    const voiceHints = m.kind === 'voice' ? hints.filter((h) => h.id !== 'reported') : [];
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
    const kind = voice ? 'voice_signs' : m.kind === 'frame' ? 'video_signs' : m.kind === 'document' ? 'document_signs' : m.kind === 'site' ? 'site_signs' : 'picture_signs';
    if (!first(kind)) continue;
    const what = voice ? 'voice' : m.kind === 'frame' ? 'video' : m.kind === 'document' ? 'document' : 'picture';
    const title = m.kind === 'site'
      ? g.assessment === 'likely_ai' ? `Looks like a scam website${g.claimsToBe ? ` posing as ${g.claimsToBe}` : ''}` : g.assessment === 'likely_edited' ? 'A suspicious website' : 'Something odd on the website'
      : g.assessment === 'likely_ai'
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
