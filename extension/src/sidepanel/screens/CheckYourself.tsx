import { useRef, useState, type DragEvent } from 'react';
import { DetailHead, Icon, Privacy, Section } from '../components';

interface Props {
  busy: boolean;
  emailOpen: boolean;
  onBack: () => void;
  onText: (text: string) => Promise<void>;
  onFile: (data: ArrayBuffer, name: string) => Promise<void>;
  onAttached: () => Promise<void>;
}

/** The fallback when captions or Gmail cannot be read: paste a message, or check an invoice PDF yourself. */
export function CheckYourself({ busy, emailOpen, onBack, onText, onFile, onAttached }: Props) {
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const takeFile = async (file?: File) => {
    if (!file) return;
    await onFile(await file.arrayBuffer(), file.name);
    onBack();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void takeFile([...e.dataTransfer.files].find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)));
  };

  return (
    <>
      <DetailHead title="Paste or drop" kicker="Check it yourself" badges={[{ source: 'on_device', label: 'Read on this laptop' }]} onBack={onBack} />
      <main className="main">
        <Section title="A message">
          <div className="surface card-pad">
            <div className="field">
              <label htmlFor="paste" className="visually-hidden">
                Message or meeting captions
              </label>
              <textarea id="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an email, a chat or the meeting captions…" />
            </div>
            <button
              className="btn primary"
              disabled={busy || !text.trim()}
              onClick={async () => {
                await onText(text);
                onBack();
              }}
            >
              Check this text
            </button>
          </div>
        </Section>

        <Section title="An invoice">
          <div className="stack">
            {emailOpen && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  await onAttached();
                  onBack();
                }}
              >
                {Icon.file(16)}
                Check the PDF attached to this email
              </button>
            )}
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
              <strong>Drop a PDF here</strong>
              <span>or click to choose a file</span>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                className="visually-hidden"
                onChange={(e) => void takeFile(e.target.files?.[0])}
              />
            </label>
          </div>
        </Section>

        <Privacy>Both are read on this laptop and not stored.</Privacy>
      </main>
    </>
  );
}
