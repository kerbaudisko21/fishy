import { addDoc, collection, doc, getDocs, getFirestore, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { demoData } from '../demo/dataset';
import { DEMO_KNOWN_BAD } from '../demo/fixtures';
import type { StartResult } from './call-wait';
import { DATABASE, DEMO, FIREBASE_READY, IN_EXTENSION, REGION } from './config';
import { DEFAULT_SELECTORS, SELECTORS_KEY, type PageSelectors } from './messages';
import { ensureSignedIn, firebaseApp } from './firebase';
import { DEFAULT_RULES, type RulesConfig } from './rules/engine';
import type { Suspects } from './checks/known';
import type { CallState, CallStatus, DirectoryPerson, KnownBadEntry, SignalKind, Supplier } from './types';

/*
 * Everything the panel reads from or writes to Firebase. Without a Firebase config, each
 * function returns the synthetic demo data, so the panel always works.
 */

const db = () => getFirestore(firebaseApp(), DATABASE);
const fn = <I, O>(name: string) => httpsCallable<I, O>(getFunctions(firebaseApp(), REGION), name);

export interface Directory {
  people: DirectoryPerson[];
  suppliers: Supplier[];
}

/** People and suppliers on record, masked (Firestore `directoryPublic`). */
export async function loadDirectory(): Promise<Directory> {
  if (!FIREBASE_READY) {
    const { people, suppliers } = demoData();
    return { people, suppliers };
  }
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
  // Firestore refuses undefined values, and the rules accept only known fields: leave empty ones out.
  const clean = Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined));
  const ref = await addDoc(collection(db(), 'checks'), { ownerUid: user.uid, createdAt: serverTimestamp(), summary: clean });
  return ref.id;
}

/** Step 4: asks Cloud Functions to call the target on the number on record (never a number from the message). */
export async function startVerificationCall(checkId: string, targetId: string): Promise<StartResult> {
  const { data } = await fn<{ checkId: string; personId: string }, Partial<StartResult>>('startVerificationCall')({ checkId, personId: targetId });
  // The answer says whether a phone call was really placed, and gives the approval page when there is one.
  return { call: data.call === 'placed' ? 'placed' : 'not_placed', reason: data.reason ?? null, approvalUrl: data.approvalUrl ?? null };
}

/**
 * Shared learning: the accounts, domains and numbers in the request, kept beside the check.
 * They join the known-scam list only if the real person says "not me" and enters their PIN.
 * Best effort: a failure here never stops the call.
 */
export async function reportSuspects(checkId: string, suspects: Suspects): Promise<void> {
  if (!suspects.accounts.length && !suspects.domains.length && !suspects.numbers.length) return;
  try {
    await fn<{ checkId: string; suspects: Suspects }, { kept: number }>('reportSuspects')({ checkId, suspects });
  } catch (e) {
    console.warn('[FISHY] reporting the request details failed', e);
  }
}

/** A link to this check's incident report, for the finance manager. Null when it cannot be made. */
export async function shareIncident(checkId: string): Promise<string | null> {
  if (!FIREBASE_READY) return null;
  try {
    return (await fn<{ checkId: string }, { url: string }>('shareIncident')({ checkId })).data.url;
  } catch (e) {
    console.warn('[FISHY] sharing the incident report failed', e);
    return null;
  }
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

/**
 * R8 · Voice-clone score for a clip the user chose to send. Returns 0–1, or null when the function
 * is not reachable. In demo mode without Firebase it returns the demo story's 0.87, labelled as demo.
 */
export async function scoreVoice(base64: string, mime: string): Promise<{ score: number; demo: boolean } | null> {
  if (!FIREBASE_READY) return DEMO ? { score: 0.87, demo: true } : null;
  try {
    const { score } = (await fn<{ audio: string; mime: string }, { score: number }>('scoreVoice')({ audio: base64, mime })).data;
    return { score, demo: false };
  } catch (e) {
    console.warn('[FISHY] voice score failed', e);
    return null;
  }
}

/** R3 · Domain age in days (RDAP lookup in Cloud Functions; only the domain is sent). */
export async function domainAge(domain: string): Promise<{ days: number; registered: string } | null> {
  if (!FIREBASE_READY) return null;
  try {
    return (await fn<{ domain: string }, { days: number; registered: string }>('domainAge')({ domain })).data;
  } catch (e) {
    console.warn('[FISHY] domain age failed', e);
    return null;
  }
}

/** Pushes Meet/Gmail selectors from Remote Config to the content scripts (deck risk: "Meet pages change"). */
export async function syncSelectors() {
  if (!FIREBASE_READY || !IN_EXTENSION) return;
  try {
    const rc = getRemoteConfig(firebaseApp());
    await fetchAndActivate(rc);
    const meet = getValue(rc, 'meet_caption_selectors').asString();
    const gmail = getValue(rc, 'gmail_selectors').asString();
    const value: Partial<PageSelectors> = {};
    if (meet) value.meetCaptions = JSON.parse(meet);
    if (gmail) value.gmail = { ...DEFAULT_SELECTORS.gmail, ...JSON.parse(gmail) };
    await chrome.storage.local.set({ [SELECTORS_KEY]: value });
  } catch (e) {
    console.warn('[FISHY] selectors not updated', e);
  }
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
