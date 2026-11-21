import { addDoc, collection, doc, getDocs, getFirestore, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { DEMO_DIRECTORY, DEMO_KNOWN_BAD, DEMO_SUPPLIERS } from '../demo/fixtures';
import { FIREBASE_READY, IN_EXTENSION, REGION } from './config';
import { ensureSignedIn, firebaseApp } from './firebase';
import { DEFAULT_RULES, type RulesConfig } from './rules/engine';
import type { CallState, CallStatus, DirectoryPerson, KnownBadEntry, SignalKind, Supplier } from './types';

/*
 * Everything the panel reads from or writes to Firebase. Without a Firebase config, each
 * function returns the synthetic demo data, so the panel always works.
 */

const db = () => getFirestore(firebaseApp());
const fn = <I, O>(name: string) => httpsCallable<I, O>(getFunctions(firebaseApp(), REGION), name);

export interface Directory {
  people: DirectoryPerson[];
  suppliers: Supplier[];
}

/** People and suppliers on record, masked (Firestore `directoryPublic`). */
export async function loadDirectory(): Promise<Directory> {
  if (!FIREBASE_READY) return { people: DEMO_DIRECTORY, suppliers: DEMO_SUPPLIERS };
  await ensureSignedIn();
  const snap = await getDocs(collection(db(), 'directoryPublic'));
  const people: DirectoryPerson[] = [];
  const suppliers: Supplier[] = [];
  snap.forEach((d) => {
    const v = d.data();
    if (v.type === 'supplier') suppliers.push({ id: d.id, ...(v as Omit<Supplier, 'id'>) });
    else people.push({ id: d.id, ...(v as Omit<DirectoryPerson, 'id'>) });
  });
  return { people, suppliers };
}

const KNOWN_KEY = 'knownBad';
const KNOWN_MAX_AGE = 60 * 60 * 1000;

/** Known bad details, cached on the laptop for an hour so matching works offline (R5). */
export async function loadKnownBad(): Promise<{ list: KnownBadEntry[]; updatedAt: number }> {
  if (!FIREBASE_READY) return { list: DEMO_KNOWN_BAD, updatedAt: Date.now() - 2 * 60 * 60 * 1000 };
  if (IN_EXTENSION) {
    const cached = (await chrome.storage.local.get(KNOWN_KEY))[KNOWN_KEY] as { list: KnownBadEntry[]; updatedAt: number } | undefined;
    if (cached && Date.now() - cached.updatedAt < KNOWN_MAX_AGE) return cached;
  }
  await ensureSignedIn();
  const snap = await getDocs(collection(db(), 'knownBad'));
  const value = { list: snap.docs.map((d) => d.data() as KnownBadEntry), updatedAt: Date.now() };
  if (IN_EXTENSION) await chrome.storage.local.set({ [KNOWN_KEY]: value });
  return value;
}

/** Rules engine config from Remote Config `scam_rules`, so new scams are blocked without a release (R2). */
export async function loadRules(): Promise<RulesConfig> {
  if (!FIREBASE_READY) return { ...DEFAULT_RULES, version: 14 };
  try {
    const rc = getRemoteConfig(firebaseApp());
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    await fetchAndActivate(rc);
    const raw = getValue(rc, 'scam_rules').asString();
    return raw ? ({ ...DEFAULT_RULES, ...JSON.parse(raw) } as RulesConfig) : DEFAULT_RULES;
  } catch (e) {
    console.warn('[FISHY] Remote Config unavailable, using built-in rules', e);
    return DEFAULT_RULES;
  }
}

/** What a check stores: signal kinds and masked details only, never message text. */
export interface CheckSummary {
  flags: SignalKind[];
  patterns: string[];
  place: 'meet' | 'gmail' | 'paste';
  amount?: { value: number; currency: string };
  payee?: string;
}

export async function createCheck(summary: CheckSummary): Promise<string> {
  const user = await ensureSignedIn();
  const ref = await addDoc(collection(db(), 'checks'), { ownerUid: user.uid, createdAt: serverTimestamp(), summary });
  return ref.id;
}

/** Step 4: asks Cloud Functions to call the target on the number on record (never a number from the message). */
export async function startVerificationCall(checkId: string, targetId: string) {
  await fn<{ checkId: string; personId: string }, { ok: true }>('startVerificationCall')({ checkId, personId: targetId });
}

const CALL_STATES: CallState[] = ['idle', 'ringing', 'confirmed', 'not_me', 'no_answer', 'escalated'];

/** Call progress, written by Cloud Functions from the phone menu. */
export function watchCall(checkId: string, onChange: (s: Partial<CallStatus>) => void) {
  return onSnapshot(doc(db(), 'checks', checkId), (snap) => {
    const call = snap.data()?.call as { state?: string; escalateAt?: { toMillis(): number }; escalatedTo?: string } | undefined;
    if (!call?.state || !CALL_STATES.includes(call.state as CallState)) return;
    onChange({ state: call.state as CallState, escalateAt: call.escalateAt?.toMillis(), escalatedTo: call.escalatedTo });
  });
}

/** Web Risk via Cloud Functions: only the links are sent, never the email. */
export async function checkLinks(urls: string[]): Promise<{ unsafe: string[] } | null> {
  if (!FIREBASE_READY || !urls.length) return null;
  try {
    return (await fn<{ urls: string[] }, { unsafe: string[] }>('checkLinks')({ urls })).data;
  } catch (e) {
    console.warn('[FISHY] Web Risk check failed', e);
    return null;
  }
}
