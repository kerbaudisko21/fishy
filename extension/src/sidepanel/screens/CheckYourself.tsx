import { useRef, useState, type DragEvent } from 'react';
import { DetailHead, Icon, Privacy, Section } from '../components';

interface Props {
  busy: boolean;
  emailOpen: boolean;
  onBack: () => void;
  onText: (text: string) => Promise<void>;
  /** A picture, a PDF or a voice recording. */
  onFile: (file: File) => Promise<void>;
  onAttached: () => Promise<void>;
  /** Record 10 s of the call in this tab. */
  onVoice: () => Promise<void>;
  /** Capture one frame of the video call in this tab. */
  onFrame: () => Promise<void>;
  /** Where to go once a check has started. */
  onDone: () => void;
}

const ACCEPT = 'image/*,application/pdf,.pdf,audio/*,.m4a,.mp3,.wav,.ogg,.webm,.opus';

/** Check something: a file someone sent, the call you are in, or a message. */
export function CheckYourself({ busy, emailOpen, onBack, onText, onFile, onAttached, onVoice, onFrame, onDone }: Props) {
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = (run: () => Promise<void>) => {
    onDone();
    void run();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) take(() => onFile(file));
  };

  return (
    <>
      <DetailHead title="Check something" badges={[{ source: 'on_device', label: 'On this laptop first' }]} onBack={onBack} />
      <main className="main">
        <Section title="Something you were sent">
          <label
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span className="drop-icon">{Icon.upload(20)}</span>
            <strong>Drop a picture, a document or a voice recording</strong>
            <span>A photo, an ID, a receipt, an invoice PDF or a voice note. Or click to choose.</span>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="visually-hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) take(() => onFile(file));
              }}
            />
          </label>
          {emailOpen && (
            <button className="btn secondary" disabled={busy} onClick={() => take(onAttached)}>
              {Icon.file(16)}
              Check the PDF attached to this email
            </button>
          )}
        </Section>

        <Section title="The call you are in" aside="Meet, Zoom or Teams in Chrome">
          <div className="surface">
            <button className="start-row action" disabled={busy} onClick={() => take(onFrame)}>
              <span className="start-icon">{Icon.video(18)}</span>
              <span className="grow">
                <span className="row-title">Check the video</span>
                <span className="row-detail">Captures one frame of the call in this tab.</span>
              </span>
              <span className="flag-chevron">{Icon.chevron(16)}</span>
            </button>
            <button className="start-row action" disabled={busy} onClick={() => take(onVoice)}>
              <span className="start-icon">{Icon.mic(18)}</span>
              <span className="grow">
                <span className="row-title">Check the voice</span>
                <span className="row-detail">Records 10 seconds of the call. You keep hearing it.</span>
              </span>
              <span className="flag-chevron">{Icon.chevron(16)}</span>
            </button>
          </div>
        </Section>

        <Section title="A message">
          <div className="surface card-pad">
            <div className="field">
              <label htmlFor="paste" className="visually-hidden">
                Message or meeting captions
              </label>
              <textarea id="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an email, a chat or the meeting captions…" />
            </div>
            <button className="btn secondary" disabled={busy || !text.trim()} onClick={() => take(() => onText(text))}>
              Check this message
            </button>
          </div>
        </Section>

        <Privacy>Files and messages are read on this laptop first. A picture goes to the cloud only without Gemini Nano; a voice clip always does. Nothing is stored.</Privacy>
      </main>
    </>
  );
}
