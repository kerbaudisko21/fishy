import { currentDataSet, DATA_TOGGLE, DATASETS, type DataSet } from '../demo/dataset';

const LABEL: Record<DataSet, string> = { demo: 'Demo', worst: 'Worst case', one: 'One', empty: 'Empty' };

/**
 * Dev-only switch between the demo data and the stress data (break-ui). Never in a release build.
 * The choice lives in the URL, so a reload keeps it.
 */
export function DataToggle() {
  // Hidden until asked for (?data=… in the URL), so a development build looks like the real one.
  if (!DATA_TOGGLE || !new URLSearchParams(location.search).has('data')) return null;
  const active = currentDataSet();
  const pick = (set: DataSet) => {
    const url = new URL(location.href);
    if (set === 'demo') url.searchParams.delete('data');
    else url.searchParams.set('data', set);
    location.replace(url);
  };
  return (
    <div
      role="group"
      aria-label="Test data (development only)"
      style={{ position: 'fixed', top: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: '#e5e7eb', font: '600 11px system-ui, sans-serif', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}
    >
      {DATASETS.map((set) => (
        <button
          key={set}
          onClick={() => pick(set)}
          aria-pressed={set === active}
          style={{ border: 0, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', font: 'inherit', color: '#111827', background: set === active ? '#fff' : 'transparent' }}
        >
          {LABEL[set]}
        </button>
      ))}
    </div>
  );
}
