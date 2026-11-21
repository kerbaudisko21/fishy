import { useRef, useState, type DragEvent } from 'react';
import { DetailHead, Icon } from '../components';

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
      <DetailHead title="Check it yourself" step="WHEN THE PAGE CAN’T BE READ" badges={[{ source: 'on_device', label: 'Read on this laptop' }]} onBack={onBack} />
      <main className="main">
        <section className="card card-pad" aria-label="Paste text">
          <div className="field">
            <label htmlFor="paste">Paste a message or the meeting captions</label>
            <textarea id="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder="“Keep this between us. I need it paid today…”" />
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
          <p className="hint" style={{ textAlign: 'left' }}>
            The text is read on this laptop and not stored.
          </p>
        </section>

        <section className="stack" aria-label="Invoice">
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
              Check the invoice attached to this email
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
            {Icon.upload(20)}
            <strong>Check an invoice PDF</strong>
            <span>Drop it here or choose a file. It never leaves this laptop.</span>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              onChange={(e) => void takeFile(e.target.files?.[0])}
            />
          </label>
        </section>
      </main>
    </>
  );
}
