import type { MediaCheck, Signal, Step, Verdict as VerdictT } from '../../lib/types';
import { ActionGrid, DropZone, RecentChecks, ScamType, WatchPanel } from '../scanner';
import { scoreMedia } from '../../lib/media-score';
import { PARTLY_CHECKED } from '../../lib/ai/fallback';
import type { WatchState } from '../useAnalysis';
import { FlagRow, Icon, Privacy, Section, SourceBadge, Tile } from '../components';
import { useFirstSeen } from '../motion';
import type { Screen } from '../routes';

/*
 * Home and result: the three ways to check (something you were sent, what's open in this tab,
 * then check with them another way), and after a check, what it found. FISHY checks media,
 * websites and messages; it doesn't take part in payments.
 */

interface Props {
  verdict: VerdictT;
  hasInput: boolean;
  /** Gemini never read the pasted message: only the keyword list did. */
  readerFailed?: boolean;
  busy: string | null;
  /** Clears this check and starts over. */
  onNewCheck: () => void;
  onOpenFlag: (kind: VerdictT['flags'][number]['kind']) => Screen | null;
  onOpen: (s: Screen) => void;
  onPaste: () => void;
  /** A dropped or chosen file: picture, PDF or voice recording. */
  onFile: (file: File) => void;
  /** What was checked in this session, for "Your checks". */
  media?: MediaCheck[];
  onOpenMedia: (id: string) => void;
  /** The scam pattern behind a name, for its signs and what to do. */
  patternInfo: (name: string) => { signs?: string[]; action?: string } | undefined;
  onVoice?: () => void;
  onFrame?: () => void;
  onSite?: () => void;
  /** Watch mode: the face every 20 s, with a sequential test. */
  watch: WatchState | null;
  onWatch?: () => void;
  onStopWatch: () => void;
}

type Tone = 'navy' | 'coral' | 'green';

const GROUPS: Array<{ step: Exclude<Step, 'call'>; label: string }> = [
  { step: 'read', label: 'Read' },
  { step: 'check', label: 'Check' },
  { step: 'match', label: 'Match' },
];

/** The source most flags in a group share; only flags that differ show their own badge. */
function groupSource(flags: Signal[]) {
  const onDevice = flags.filter((f) => f.source === 'on_device').length;
  return onDevice >= flags.length - onDevice ? 'on_device' : 'cloud';
}

export function Verdict(p: Props) {
  const { verdict } = p;
  const n = verdict.flags.length;
  const waiting = !p.hasInput;
  // The strongest checked file, voice, video or website: the hero never says "not enough"
  // while a card below says "strong signs".
  const strongest = (p.media ?? [])
    .map((m) => ({ m, s: scoreMedia(m) }))
    .filter((x) => x.s.score !== null)
    .sort((a, b) => b.s.score! - a.s.score!)[0];
  const high = strongest?.s.band === 'high';

  const hero: { tone: Tone; pill: string; title: string; line: string } = waiting
    ? { tone: 'navy', pill: 'Ready', title: 'Is it real?', line: 'Check it before you act on it.' }
    : verdict.level === 'fishy' || high
      ? {
          tone: 'coral',
          pill: 'Fishy',
          title: 'Something’s fishy.',
          line: high ? `${strongest!.m.name} scored ${strongest!.s.score}. Don’t act on it until you’ve checked with them another way.` : `${n} red flag${n === 1 ? '' : 's'}. Don’t act on it until you’ve checked with them another way.`,
        }
      : n > 0
        ? { tone: 'navy', pill: n === 1 ? 'A sign to look at' : `${n} signs to look at`, title: 'Take a closer look.', line: 'Not enough to call it fake. Look at the signs below.' }
        : p.readerFailed
          ? // Nothing found, but Gemini never read it: not a clean result.
            { tone: 'navy', ...PARTLY_CHECKED }
          : { tone: 'green', pill: 'No clear signs', title: 'No clear signs.', line: 'A good fake can pass every check: if it matters, check with them another way.' };

  // Motion: the result plays in once per new result; the hero text replays on every change.
  const sig = waiting ? 'waiting' : `${verdict.level}:${verdict.flags.map((f) => f.kind).join(',')}:${strongest?.s.score ?? ''}`;
  const intro = useFirstSeen(`result:${sig}`);
  const heroIntro = useFirstSeen(`hero:${sig}:${hero.tone}`);
  let flagIndex = 0;

  return (
    <>
      <section className={`hero ${hero.tone}`} aria-live="polite">
        <div key={`${hero.tone}:${sig}`} className={`hero-body${heroIntro ? ' intro' : ''}`}>
          <span className="hero-pill">
            {hero.tone === 'coral' ? Icon.bang(12) : hero.tone === 'green' ? Icon.check(12) : <span className="pulse" />}
            {hero.pill}
          </span>
          <h1>{hero.title}</h1>
          <p>{hero.line}</p>
        </div>
      </section>

      <main className={`main${intro ? ' intro' : ''}`}>
        {p.busy && (
          <p className="status-line" role="status">
            <span className="spinner" aria-hidden="true" />
            {p.busy}
          </p>
        )}

        {waiting && (
          <div className="home">
            <DropZone onFile={p.onFile} disabled={!!p.busy} />
            <ActionGrid onFrame={p.onFrame} onVoice={p.onVoice} onSite={p.onSite} onText={p.onPaste} busy={!!p.busy} />
            <WatchPanel watch={p.watch} onStart={p.onWatch} onStop={p.onStopWatch} disabled={!!p.busy} />
          </div>
        )}

        {!waiting && (p.watch?.on || p.watch?.alarm) && <WatchPanel watch={p.watch} onStop={p.onStopWatch} />}
        {!waiting && <ScamType names={verdict.patterns} info={p.patternInfo} />}

        {p.media && p.media.length > 0 && !waiting && (
          <Section title="Your checks" aside="Tap one for the score and why">
            <RecentChecks items={p.media} onOpen={p.onOpenMedia} />
          </Section>
        )}

        {n > 0 && (
          <Section title={`${n} red flag${n === 1 ? '' : 's'}`} label="Red flags" aside="Tap one for the evidence">
            <div className="surface flags">
              {GROUPS.map((g) => {
                const flags = verdict.flags.filter((f) => f.step === g.step);
                if (!flags.length) return null;
                const source = groupSource(flags);
                return (
                  <div key={g.step} className="flag-group">
                    <div className="group-head">
                      <span>{g.label}</span>
                      <SourceBadge source={source} />
                    </div>
                    {flags.map((f) => {
                      const screen = p.onOpenFlag(f.kind);
                      return <FlagRow key={f.kind} index={flagIndex++} flag={f} showSource={f.source !== source} onOpen={screen ? () => p.onOpen(screen) : undefined} />;
                    })}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {!waiting && (
          <Section title="Check more">
            <div className="tiles">
              <Tile icon={Icon.image(20)} title="A file" detail="Picture, PDF, voice" onClick={p.onPaste} disabled={!!p.busy} />
              {p.onFrame && <Tile icon={Icon.video(20)} title="The face" detail="Watches 4 s" onClick={p.onFrame} disabled={!!p.busy} />}
              {p.onVoice && <Tile icon={Icon.mic(20)} title="The voice" detail="10 seconds" onClick={p.onVoice} disabled={!!p.busy} />}
              {p.onSite && <Tile icon={Icon.link(20)} title="The website" detail="This tab" onClick={p.onSite} disabled={!!p.busy} />}
            </div>
            <button className="btn secondary small" onClick={p.onNewCheck}>
              Start a new check
            </button>
          </Section>
        )}

        <Privacy>{waiting ? 'Checked on this laptop first.' : 'Everything is checked on this laptop first. The cloud gets only what you chose to check, and only when Gemini Nano can’t do it (a voice clip always goes; message text is redacted first).'}</Privacy>
      </main>
    </>
  );
}
