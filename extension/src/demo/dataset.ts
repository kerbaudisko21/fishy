// Which demo data the panel runs on. Always the normal demo in a release build; in development
// (or a build made with VITE_DATA_TOGGLE=true for design checks) `?data=worst|one|empty` in the
// panel's URL swaps the data at this one boundary, so the screens are tested exactly as they are.
import type { DirectoryPerson, Evidence, PaymentRequest, Signal, Supplier } from '../lib/types';
import { DEMO_DIRECTORY, DEMO_EVIDENCE, DEMO_REQUEST, DEMO_SIGNALS, DEMO_SUPPLIERS } from './fixtures';
import { ONE_DIRECTORY, ONE_REQUEST, ONE_SIGNALS, ONE_SUPPLIERS, WORST_DIRECTORY, WORST_EVIDENCE, WORST_REQUEST, WORST_SIGNALS, WORST_SUPPLIERS } from './worst';

export const DATASETS = ['demo', 'worst', 'one', 'empty'] as const;
export type DataSet = (typeof DATASETS)[number];

/** True only where the switch may appear: never in a release build. */
export const DATA_TOGGLE = import.meta.env.DEV || import.meta.env.VITE_DATA_TOGGLE === 'true';

export function currentDataSet(): DataSet {
  if (!DATA_TOGGLE || typeof location === 'undefined') return 'demo';
  const asked = new URLSearchParams(location.search).get('data');
  return (DATASETS as readonly string[]).includes(asked ?? '') ? (asked as DataSet) : 'demo';
}

export interface DemoData {
  request?: PaymentRequest;
  signals: Signal[];
  evidence: Evidence;
  people: DirectoryPerson[];
  suppliers: Supplier[];
}

export function demoData(set: DataSet = currentDataSet()): DemoData {
  switch (set) {
    case 'worst':
      return { request: WORST_REQUEST, signals: WORST_SIGNALS, evidence: WORST_EVIDENCE, people: WORST_DIRECTORY, suppliers: WORST_SUPPLIERS };
    case 'one':
      return { request: ONE_REQUEST, signals: ONE_SIGNALS, evidence: { known: DEMO_EVIDENCE.known }, people: ONE_DIRECTORY, suppliers: ONE_SUPPLIERS };
    case 'empty':
      return { request: undefined, signals: [], evidence: {}, people: [], suppliers: [] };
    default:
      return { request: DEMO_REQUEST, signals: DEMO_SIGNALS, evidence: DEMO_EVIDENCE, people: DEMO_DIRECTORY, suppliers: DEMO_SUPPLIERS };
  }
}
