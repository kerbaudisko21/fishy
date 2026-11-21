import { BackLink } from '../components';

/*
 * Placeholder for the evidence screens (Tactics, Email and links, Invoice check,
 * Voice check, Known scams). Each gets its own file following the design canvas:
 * https://claude.ai/artifact/D2neF4bvCTBrrWq8uiohMN
 */
export function Detail({ title, step, onBack }: { title: string; step: string; onBack: () => void }) {
  return (
    <main className="main">
      <BackLink onBack={onBack} />
      <h1 style={{ fontSize: 24 }}>{title}</h1>
      <span className="step-label">{step}</span>
      <p className="hint" style={{ textAlign: 'left' }}>
        TODO: build from the design canvas.
      </p>
    </main>
  );
}
